import { RecordsScreen } from '@/components/records/RecordsScreen';
import { ClientOnly, ScreenLoading } from '@/components/ClientOnly';

export const metadata = { title: 'Records | Remote Firing Analyzer' };

export default function Page() {
  return (
    <ClientOnly fallback={<ScreenLoading />}>
      <RecordsScreen />
    </ClientOnly>
  );
}
