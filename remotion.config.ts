import { Config } from '@remotion/cli/config';

// Product demos for the Presence landing page. See remotion/demos.tsx.
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setCodec('h264');
Config.setCrf(20);
