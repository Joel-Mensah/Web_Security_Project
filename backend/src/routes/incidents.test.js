'use strict';

const mockQuery = jest.fn();
const mockGetClient = jest.fn();
const mockLog = jest.fn();
const mockUploadIncidentEvidence = jest.fn();
const mockRemoveIncidentEvidence = jest.fn();
const mockCreateEvidenceSignedUrl = jest.fn();

jest.mock('../config/db', () => ({
  query: mockQuery,
  getClient: mockGetClient,
}));

jest.mock('../services/auditService', () => ({
  log: mockLog,
  AuditAction: {
    INCIDENT_REPORTED: 'INCIDENT_REPORTED',
    INCIDENT_REPORT_EDITED: 'INCIDENT_REPORT_EDITED',
    INCIDENT_TRIAGED: 'INCIDENT_TRIAGED',
    INCIDENT_COMMENT_ADDED: 'INCIDENT_COMMENT_ADDED',
    INCIDENT_PRIVATE_NOTE_ADDED: 'INCIDENT_PRIVATE_NOTE_ADDED',
    INCIDENT_EVIDENCE_VIEWED: 'INCIDENT_EVIDENCE_VIEWED',
  },
}));

jest.mock('../services/incidentEvidenceService', () => ({
  MAX_FILE_BYTES: 5 * 1024 * 1024,
  MAX_FILES: 3,
  uploadIncidentEvidence: mockUploadIncidentEvidence,
  removeIncidentEvidence: mockRemoveIncidentEvidence,
  createEvidenceSignedUrl: mockCreateEvidenceSignedUrl,
}));

jest.mock('../middleware/authenticate', () => (_req, _res, next) => next());
jest.mock('../middleware/authorizeRole', () => () => (_req, _res, next) => next());

const router = require('./incidents');

function getHandler(path, method) {
  return router.stack
    .find((layer) => layer.route?.path === path && layer.route.methods[method])
    .route.stack.at(-1).handle;
}

const summaryHandler = getHandler('/summary', 'get');
const listHandler = getHandler('/', 'get');
const createHandler = getHandler('/', 'post');
const detailHandler = getHandler('/:id', 'get');
const editHandler = getHandler('/:id', 'patch');
const triageHandler = getHandler('/:id/triage', 'patch');
const updatesHandler = getHandler('/:id/updates', 'post');
const evidenceHandler = getHandler('/:id/evidence/:evidenceId', 'get');

function makeResponse() {
  return {
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };
}

const staff = {
  id: '00000000-0000-0000-0000-000000000001',
  username: 'reporter',
  role: 'inputer',
};

beforeEach(() => {
  mockQuery.mockReset();
  mockGetClient.mockReset();
  mockLog.mockReset().mockResolvedValue(undefined);
  mockUploadIncidentEvidence.mockReset().mockResolvedValue([]);
  mockRemoveIncidentEvidence.mockReset().mockResolvedValue(undefined);
  mockCreateEvidenceSignedUrl.mockReset().mockResolvedValue('https://storage.example/signed');
});

test('limits a staff dashboard summary to reports they submitted or were assigned', async () => {
  const summary = { total: 2, open: 1, urgent: 1, resolved: 1 };
  mockQuery.mockResolvedValue({ rows: [summary] });
  const response = makeResponse();

  await summaryHandler({ user: staff }, response);

  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('WHERE reporter_id = $1 OR assignee_id = $1'),
    [staff.id]
  );
  expect(response.json).toHaveBeenCalledWith(summary);
});

test('applies staff visibility to incident listing and counts', async () => {
  mockQuery.mockImplementation(async (sql) => (
    sql.includes('COUNT(*)') ? { rows: [{ total: 1 }] } : { rows: [{ id: 'incident-1' }] }
  ));
  const response = makeResponse();

  await listHandler({ user: staff, query: {} }, response);

  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('(i.reporter_id = $1 OR i.assignee_id = $1)'),
    [staff.id, 25, 0]
  );
  expect(response.json).toHaveBeenCalledWith({
    incidents: [{ id: 'incident-1' }],
    total: 1,
    page: 1,
    limit: 25,
  });
});

test('does not let staff add private incident notes', async () => {
  const response = makeResponse();

  await updatesHandler(
    {
      params: { id: '00000000-0000-0000-0000-000000000002' },
      body: { message: 'Investigation update', internal: true },
      user: staff,
    },
    response
  );

  expect(response.status).toHaveBeenCalledWith(403);
  expect(mockGetClient).not.toHaveBeenCalled();
});

test('allows the reporter to edit the report before a responder replies', async () => {
  const incident = {
    id: '00000000-0000-0000-0000-000000000002',
    reporter_id: staff.id,
    reporter_response_at: null,
    referred_to_authority_at: null,
  };
  const client = {
    query: jest.fn(async (sql) => {
      if (sql.startsWith('SELECT * FROM incidents')) return { rows: [incident] };
      if (sql.startsWith('SELECT 1')) return { rows: [] };
      if (sql.startsWith('UPDATE incidents')) return { rows: [{ ...incident, title: 'Updated report title' }] };
      return { rows: [] };
    }),
    release: jest.fn(),
  };
  mockGetClient.mockResolvedValue(client);
  const response = makeResponse();

  await editHandler(
    {
      params: { id: incident.id },
      body: {
        title: 'Updated report title',
        description: 'The report description contains enough detail for the response team.',
        category: 'suspicious_email',
        severity: 'high',
      },
      user: staff,
      headers: {},
      ip: '127.0.0.1',
    },
    response
  );

  expect(client.query).toHaveBeenCalledWith('COMMIT');
  expect(client.query).toHaveBeenCalledWith(
    expect.stringContaining('Reporter edited the incident report'),
    expect.any(Array)
  );
  expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
    action: 'INCIDENT_REPORT_EDITED',
    details: { incidentId: incident.id },
  }));
  expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ title: 'Updated report title' }));
  expect(client.release).toHaveBeenCalled();
});

test.each([
  ['responder reply', { reporter_response_at: new Date().toISOString() }],
  ['authority referral', { referred_to_authority_at: new Date().toISOString() }],
])('prevents the reporter from editing after %s', async (_reason, lockState) => {
  const incident = {
    id: '00000000-0000-0000-0000-000000000002',
    reporter_id: staff.id,
    reporter_response_at: null,
    referred_to_authority_at: null,
    ...lockState,
  };
  const client = {
    query: jest.fn(async (sql) => (
      sql.startsWith('SELECT * FROM incidents') ? { rows: [incident] } : { rows: [] }
    )),
    release: jest.fn(),
  };
  mockGetClient.mockResolvedValue(client);
  const response = makeResponse();

  await editHandler(
    {
      params: { id: incident.id },
      body: {
        title: 'Updated report title',
        description: 'The report description contains enough detail for the response team.',
        category: 'suspicious_email',
        severity: 'high',
      },
      user: staff,
    },
    response
  );

  expect(response.status).toHaveBeenCalledWith(409);
  expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  expect(client.query).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE incidents'), expect.anything());
});

test('records public responder replies as an edit lock for the reporter', async () => {
  const client = {
    query: jest.fn(async (sql) => (
      sql.startsWith('SELECT i.id')
        ? { rows: [{ id: '00000000-0000-0000-0000-000000000002' }] }
        : sql.startsWith('INSERT INTO incident_updates')
          ? { rows: [{ id: 'update-id' }] }
          : { rows: [] }
    )),
    release: jest.fn(),
  };
  mockGetClient.mockResolvedValue(client);
  const response = makeResponse();

  await updatesHandler(
    {
      params: { id: '00000000-0000-0000-0000-000000000002' },
      body: { message: 'We have received your report and are reviewing it.' },
      user: { id: '00000000-0000-0000-0000-000000000004', role: 'administrator' },
      headers: {},
      ip: '127.0.0.1',
    },
    response
  );

  expect(client.query).toHaveBeenCalledWith(
    expect.stringContaining('reporter_response_at = CASE'),
    ['00000000-0000-0000-0000-000000000002', true]
  );
  expect(client.query).toHaveBeenCalledWith('COMMIT');
  expect(response.status).toHaveBeenCalledWith(201);
});

test('does not allow managers to record an authority referral', async () => {
  const response = makeResponse();

  await triageHandler(
    {
      params: { id: '00000000-0000-0000-0000-000000000002' },
      body: { referToAuthority: true },
      user: { id: '00000000-0000-0000-0000-000000000004', role: 'manager' },
    },
    response
  );

  expect(response.status).toHaveBeenCalledWith(403);
  expect(mockGetClient).not.toHaveBeenCalled();
});

test('requires a resolution summary before an incident can be resolved', async () => {
  const client = {
    query: jest.fn(async (sql) => (
      sql.startsWith('SELECT * FROM incidents')
        ? { rows: [{ status: 'in_progress', resolution_summary: null }] }
        : { rows: [] }
    )),
    release: jest.fn(),
  };
  mockGetClient.mockResolvedValue(client);
  const response = makeResponse();

  await triageHandler(
    {
      params: { id: '00000000-0000-0000-0000-000000000002' },
      body: { status: 'resolved' },
      user: { ...staff, role: 'manager' },
    },
    response
  );

  expect(response.status).toHaveBeenCalledWith(400);
  expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  expect(client.query).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE incidents'), expect.anything());
  expect(client.release).toHaveBeenCalled();
});

test('records authority referral in the report and public timeline', async () => {
  const incident = {
    id: '00000000-0000-0000-0000-000000000002',
    status: 'new',
    severity: 'medium',
    assignee_id: null,
    resolution_summary: null,
    referred_to_authority_at: null,
  };
  const client = {
    query: jest.fn(async (sql) => {
      if (sql.startsWith('SELECT * FROM incidents')) return { rows: [incident] };
      if (sql.startsWith('UPDATE incidents')) return { rows: [{ ...incident, referred_to_authority_at: 'now' }] };
      return { rows: [] };
    }),
    release: jest.fn(),
  };
  mockGetClient.mockResolvedValue(client);
  const response = makeResponse();

  await triageHandler(
    {
      params: { id: incident.id },
      body: { referToAuthority: true },
      user: { id: '00000000-0000-0000-0000-000000000004', role: 'administrator' },
      headers: {},
      ip: '127.0.0.1',
    },
    response
  );

  expect(client.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE incidents'))[0])
    .toContain('referred_to_authority_at = NOW()');
  const referralEvent = client.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO incident_updates'));
  expect(referralEvent[1]).toEqual(expect.arrayContaining([
    'Report referred to Ghana Authority Security for investigation',
    false,
  ]));
  expect(client.query).toHaveBeenCalledWith('COMMIT');
  expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ referred_to_authority_at: 'now' }));
});

test('creates a report with an automatic welcome message in one transaction', async () => {
  const incident = {
    id: '00000000-0000-0000-0000-000000000002',
    category: 'suspicious_email',
    severity: 'medium',
  };
  const client = {
    query: jest.fn(async (sql) => (
      sql.startsWith('INSERT INTO incidents') ? { rows: [incident] } : { rows: [] }
    )),
    release: jest.fn(),
  };
  mockGetClient.mockResolvedValue(client);
  const response = makeResponse();

  await createHandler(
    {
      body: {
        title: 'Unexpected password reset email',
        description: 'A password reset email arrived even though I did not request one.',
        category: 'suspicious_email',
      },
      user: staff,
      headers: {},
      ip: '127.0.0.1',
    },
    response
  );

  expect(client.query).toHaveBeenCalledWith('BEGIN');
  const initialUpdates = client.query.mock.calls.filter(([sql]) => (
    sql.includes('INSERT INTO incident_updates')
  ));
  expect(initialUpdates[0]).toEqual([
    expect.stringContaining('INSERT INTO incident_updates'),
    [incident.id, staff.id, JSON.stringify({ to: 'new' })],
  ]);
  expect(initialUpdates[1][0]).toContain("'comment'");
  expect(initialUpdates[1][1]).toEqual([
    incident.id,
    expect.stringContaining('Your report has been received.'),
    JSON.stringify({ systemMessage: true }),
  ]);
  expect(client.query).toHaveBeenCalledWith('COMMIT');
  expect(response.status).toHaveBeenCalledWith(201);
  expect(response.json).toHaveBeenCalledWith({ ...incident, evidence: [] });
  expect(client.release).toHaveBeenCalled();
});

test('stores screenshot metadata in the report timeline without exposing storage paths', async () => {
  const incident = {
    id: '00000000-0000-0000-0000-000000000002',
    category: 'suspicious_email',
    severity: 'medium',
  };
  const evidence = {
    id: '00000000-0000-0000-0000-000000000003',
    fileName: 'screen.png',
    contentType: 'image/png',
    size: 9,
    extension: 'png',
    objectPath: `incidents/${incident.id}/00000000-0000-0000-0000-000000000003.png`,
  };
  mockUploadIncidentEvidence.mockResolvedValue([evidence]);
  const client = {
    query: jest.fn(async (sql) => (
      sql.startsWith('INSERT INTO incidents') ? { rows: [incident] } : { rows: [] }
    )),
    release: jest.fn(),
  };
  mockGetClient.mockResolvedValue(client);
  const response = makeResponse();

  await createHandler(
    {
      body: {
        title: 'Unexpected password reset email',
        description: 'A password reset email arrived even though I did not request one.',
        category: 'suspicious_email',
      },
      files: [{ originalname: 'screen.png' }],
      user: staff,
      headers: {},
      ip: '127.0.0.1',
    },
    response
  );

  const evidenceInsert = client.query.mock.calls.find(([sql]) => (
    sql.includes('INSERT INTO incident_updates') && sql.includes('$4')
  ));
  expect(evidenceInsert[1][3]).toContain(evidence.objectPath);
  expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
    evidence: [{
      id: evidence.id,
      fileName: evidence.fileName,
      contentType: evidence.contentType,
      size: evidence.size,
    }],
  }));
  expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain(evidence.objectPath);
});

test('issues a signed link only for evidence on an incident visible to the requester', async () => {
  const evidenceId = '00000000-0000-0000-0000-000000000003';
  const incidentId = '00000000-0000-0000-0000-000000000002';
  mockQuery.mockResolvedValue({
    rows: [{
      evidence: {
        id: evidenceId,
        contentType: 'image/png',
        objectPath: `incidents/${incidentId}/${evidenceId}.png`,
      },
    }],
  });
  const response = makeResponse();

  await evidenceHandler(
    {
      params: { id: incidentId, evidenceId },
      user: staff,
      headers: {},
      ip: '127.0.0.1',
    },
    response
  );

  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('(i.reporter_id = $3 OR i.assignee_id = $3)'),
    [incidentId, evidenceId, staff.id]
  );
  expect(mockCreateEvidenceSignedUrl).toHaveBeenCalledWith(
    `incidents/${incidentId}/${evidenceId}.png`
  );
  expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
    action: 'INCIDENT_EVIDENCE_VIEWED',
    details: { incidentId, evidenceId },
  }));
  expect(response.json).toHaveBeenCalledWith({
    url: 'https://storage.example/signed',
    expiresIn: 60,
  });
});

test('omits private storage paths from incident details', async () => {
  const objectPath = 'incidents/incident-id/evidence.png';
  mockQuery
    .mockResolvedValueOnce({ rows: [{ id: 'incident-id' }] })
    .mockResolvedValueOnce({
      rows: [{
        id: 'update-id',
        details: {
          evidence: {
            id: '00000000-0000-0000-0000-000000000003',
            fileName: 'screen.png',
            objectPath,
          },
        },
      }],
    });
  const response = makeResponse();

  await detailHandler(
    {
      params: { id: '00000000-0000-0000-0000-000000000002' },
      user: staff,
    },
    response
  );

  expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain(objectPath);
  expect(response.json.mock.calls[0][0].updates[0].details.evidence).toEqual({
    id: '00000000-0000-0000-0000-000000000003',
    fileName: 'screen.png',
  });
});

test('does not return or sign evidence outside the requester incident scope', async () => {
  mockQuery.mockResolvedValue({ rows: [] });
  const response = makeResponse();

  await evidenceHandler(
    {
      params: {
        id: '00000000-0000-0000-0000-000000000002',
        evidenceId: '00000000-0000-0000-0000-000000000003',
      },
      user: staff,
    },
    response
  );

  expect(mockCreateEvidenceSignedUrl).not.toHaveBeenCalled();
  expect(response.status).toHaveBeenCalledWith(404);
  expect(response.json).toHaveBeenCalledWith({ message: 'Evidence not found.' });
});

test('returns a server error if a report transaction cannot acquire a database client', async () => {
  mockGetClient.mockRejectedValue(new Error('database unavailable'));
  const logError = jest.spyOn(console, 'error').mockImplementation(() => {});
  const response = makeResponse();

  await createHandler(
    {
      body: {
        title: 'Unexpected password reset email',
        description: 'A password reset email arrived even though I did not request one.',
        category: 'suspicious_email',
      },
      user: staff,
      headers: {},
      ip: '127.0.0.1',
    },
    response
  );

  expect(response.status).toHaveBeenCalledWith(500);
  expect(response.json).toHaveBeenCalledWith({
    message: 'The incident request could not be completed.',
  });
  logError.mockRestore();
});

test('hides an incident from staff who neither reported nor received assignment', async () => {
  mockQuery.mockResolvedValue({ rows: [] });
  const response = makeResponse();

  await detailHandler(
    {
      params: { id: '00000000-0000-0000-0000-000000000002' },
      user: staff,
    },
    response
  );

  expect(mockQuery.mock.calls[0][0]).toContain('i.reporter_id = $3 OR i.assignee_id = $3');
  expect(response.status).toHaveBeenCalledWith(404);
  expect(response.json).toHaveBeenCalledWith({ message: 'Incident not found.' });
});
