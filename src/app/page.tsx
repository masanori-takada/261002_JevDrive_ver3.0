import { RacerGame } from '../components/RacerGame';

export default function Home() {
  return (
    <main style={{ padding: '8px 16px' }}>
      <h1 style={{ margin: '0 0 6px', fontSize: 20 }}>JevDrive</h1>
      <RacerGame />
      <p style={{ margin: '6px 0 0', fontSize: 13 }}>矢印キーで操作（↑加速 ↓減速 ←→で車線変更）</p>
    </main>
  );
}
