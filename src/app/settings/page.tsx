import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { ClientOnly, ScreenLoading } from '@/components/ClientOnly';

export const metadata = { title: 'Settings | Remote Firing Analyzer' };

export default function Page() {
  return (
    <ClientOnly fallback={<ScreenLoading />}>
      <SettingsScreen />
    </ClientOnly>
  );
}
