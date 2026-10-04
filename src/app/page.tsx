import { AnalyzerScreen } from '@/components/analyzer/AnalyzerScreen';
import { ClientOnly, ScreenLoading } from '@/components/ClientOnly';

export default function Page() {
  return (
    <ClientOnly fallback={<ScreenLoading />}>
      <AnalyzerScreen />
    </ClientOnly>
  );
}
