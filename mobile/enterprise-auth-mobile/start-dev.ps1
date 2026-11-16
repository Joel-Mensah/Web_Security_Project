Set-Location 'd:\SCHOOL FILES\Program Development\Computer Security\mobile\enterprise-auth-mobile'
Start-Process 'npm.cmd' -ArgumentList 'run dev' -RedirectStandardOutput 'out.log' -RedirectStandardError 'err.log' -WindowStyle Hidden
Start-Sleep -Seconds 6
Write-Host '=== out.log ==='; Get-Content out.log -Tail 10 -ErrorAction SilentlyContinue
Write-Host '=== err.log ==='; Get-Content err.log -Tail 10 -ErrorAction SilentlyContinue
