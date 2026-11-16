// mobile/expo-app/app/(tabs)/_layout.jsx — bottom tabs (no icon deps)
import { Text, TouchableOpacity, View } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { Slot, usePathname, useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { styles2 } from '../../src/theme/styles2';
import { styles } from '../../src/theme/styles';

const TAB_ICON_SIZE = 18;

const BASE_TABS = [
  { path: '/(tabs)/dashboard', label: 'Home', icon: 'home' },
  { path: '/(tabs)/incidents', label: 'Reports', icon: 'shield-alt' },
  { path: '/(tabs)/report', label: 'Report', icon: 'plus' },
  { path: '/(tabs)/integrations', label: 'Links', icon: 'link' },
  { path: '/(tabs)/account', label: 'Account', icon: 'user' },
];

const ADMIN_TABS = [
  { path: '/(tabs)/system', label: 'System', icon: 'cog' },
  { path: '/(tabs)/audit', label: 'Audit', icon: 'clipboard-list' },
];

const MANAGER_TABS = [
  { path: '/(tabs)/users', label: 'Users', icon: 'users' },
];

export default function TabsLayout() {
  const router = useRouter();
  const pathname = usePathname() || '';
  const { user, hasRole } = useAuth();

  const isAdmin = hasRole('administrator');
  const isManager = hasRole('manager', 'admin', 'administrator');

  const tabs = [
    ...BASE_TABS,
    ...(isAdmin ? ADMIN_TABS : []),
    ...(isManager ? MANAGER_TABS : []),
  ];

  return (
    <View style={styles.screen}>
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
      <View style={styles2.tabBar}>
        {tabs.map((tab) => {
          const active = pathname.includes(tab.path.split('/').pop());
          return (
            <TouchableOpacity
              key={tab.path}
              style={[styles2.tabItem, active && styles2.tabItemActive]}
              onPress={() => router.replace(tab.path)}
            >
              <FontAwesome5 size={TAB_ICON_SIZE} color={styles2.tabIcon.color} name={tab.icon} />
              <Text style={[styles2.tabLabel, active && styles2.tabLabelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
