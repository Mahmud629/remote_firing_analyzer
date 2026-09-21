import { AnalyzerContainer } from '@/components/AnalyzerContainer';

export const metadata = {
  title: 'Rifle BD-08 Zeroing Analyzer',
  description: 'Professional ballistic data analysis for rifle sight zeroing',
};

export default function Home() {
  return (
    <main className="w-full h-screen bg-slate-900">
      <AnalyzerContainer />
    </main>
  );
}
