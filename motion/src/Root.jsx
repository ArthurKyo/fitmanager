import { Composition } from 'remotion';
import { Video, FPS, TOTAL_FRAMES } from './Video.jsx';
import { Reels, REELS_FRAMES } from './Reels.jsx';

export const Root = () => (
  <>
    <Composition id="FitManager" component={Video} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
    <Composition id="Reels" component={Reels} durationInFrames={REELS_FRAMES} fps={FPS} width={1080} height={1920} />
  </>
);
