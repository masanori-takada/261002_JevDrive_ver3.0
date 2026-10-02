import { RacerGame } from '../components/RacerGame';

export default function Home() {
  return (
    <main style={{ padding: 16 }}>
      <h1 style={{ margin: '0 0 12px' }}>JevDrive</h1>
      <RacerGame />
      <p>矢印キーで操作（↑加速 ↓減速 ←→ハンドル）</p>
    </main>
  );
}
