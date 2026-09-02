import React from 'react';
import { Composition } from 'remotion';
import { DemoPortrait, DemoNotices, DemoTwin, DemoConnect } from './demos';

const base = { width: 1280, height: 960, fps: 30 };

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="DemoConnect" component={DemoConnect} durationInFrames={210} {...base} />
    <Composition id="DemoPortrait" component={DemoPortrait} durationInFrames={240} {...base} />
    <Composition id="DemoNotices" component={DemoNotices} durationInFrames={270} {...base} />
    <Composition id="DemoTwin" component={DemoTwin} durationInFrames={300} {...base} />
  </>
);
