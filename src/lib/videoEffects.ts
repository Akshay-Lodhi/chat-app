import '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import * as bodyPix from '@tensorflow-models/body-pix';

let net: bodyPix.BodyPix | null = null;
let isInitializing = false;

export const initBackgroundBlur = async () => {
  if (net || isInitializing) return;
  isInitializing = true;
  try {
    net = await bodyPix.load({
      architecture: 'MobileNetV1',
      outputStride: 16,
      multiplier: 0.75,
      quantBytes: 2
    });
  } catch (err) {
    console.error('Failed to initialize background blur model', err);
  } finally {
    isInitializing = false;
  }
};

export const startBlurProcessing = (
  rawStream: MediaStream, 
  onStreamReady: (processedStream: MediaStream) => void
) => {
  if (!net) {
    console.error('BodyPix not initialized');
    return null;
  }

  // Create an offscreen video element to play the raw stream
  const videoElement = document.createElement('video');
  videoElement.autoplay = true;
  videoElement.playsInline = true;
  videoElement.muted = true;
  videoElement.srcObject = rawStream;

  // Create an offscreen canvas to draw the blurred frames
  const canvasElement = document.createElement('canvas');
  let animationId: number;
  let isRunning = true;

  videoElement.onloadedmetadata = () => {
    videoElement.play();
    canvasElement.width = videoElement.videoWidth || 640;
    canvasElement.height = videoElement.videoHeight || 480;

    const processedStream = canvasElement.captureStream(30);
    
    // Mix original audio tracks with the processed video tracks
    const audioTracks = rawStream.getAudioTracks();
    audioTracks.forEach(track => processedStream.addTrack(track));

    onStreamReady(processedStream);

    const renderFrame = async () => {
      if (!isRunning || !net) return;
      if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA && videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
        if (videoElement.width !== videoElement.videoWidth) videoElement.width = videoElement.videoWidth;
        if (videoElement.height !== videoElement.videoHeight) videoElement.height = videoElement.videoHeight;

        if (canvasElement.width !== videoElement.videoWidth || canvasElement.height !== videoElement.videoHeight) {
          canvasElement.width = videoElement.videoWidth;
          canvasElement.height = videoElement.videoHeight;
        }
        
        try {
          const segmentation = await net.segmentPerson(videoElement, {
            flipHorizontal: false,
            internalResolution: 'medium',
            segmentationThreshold: 0.7
          });
          
          // Verify everything is still valid after the async operation
          if (!isRunning || videoElement.videoWidth === 0 || videoElement.videoHeight === 0 || canvasElement.width === 0 || canvasElement.height === 0) {
            return;
          }

          if (!segmentation || segmentation.width === 0 || segmentation.height === 0) {
            return;
          }
          
          bodyPix.drawBokehEffect(
            canvasElement,
            videoElement,
            segmentation,
            10,  // backgroundBlurAmount
            3,   // edgeBlurAmount
            false // flipHorizontal
          );
        } catch (e) {
          console.error("Blur processing error", e);
        }
      }
      if (isRunning) {
        animationId = requestAnimationFrame(renderFrame);
      }
    };

    renderFrame();
  };

  return () => {
    isRunning = false;
    cancelAnimationFrame(animationId);
    videoElement.srcObject = null;
    videoElement.remove();
    canvasElement.remove();
  };
};
