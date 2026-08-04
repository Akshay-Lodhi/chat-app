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

export type VideoEffectConfig = {
  type: 'none' | 'blur' | 'image' | 'funny';
  value?: string; // image url or filter type
};

export const startVideoProcessing = (
  rawStream: MediaStream, 
  config: VideoEffectConfig,
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
  const ctx = canvasElement.getContext('2d', { willReadFrequently: true });
  
  // Create an image element for the virtual background
  const bgImage = new Image();
  bgImage.crossOrigin = 'anonymous';
  if (config.type === 'image' && config.value) {
    bgImage.src = config.value;
  }

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
          
          // Handle different effect types
          if (config.type === 'blur') {
            bodyPix.drawBokehEffect(
              canvasElement,
              videoElement,
              segmentation,
              10,  // backgroundBlurAmount
              3,   // edgeBlurAmount
              false // flipHorizontal
            );
          } else if (config.type === 'image' && ctx) {
            // Virtual Background
            const mask = bodyPix.toMask(
              segmentation,
              { r: 0, g: 0, b: 0, a: 255 }, // foreground (person) - opaque black
              { r: 0, g: 0, b: 0, a: 0 }    // background - transparent
            );
            
            // Draw original video to get current frame
            ctx.save();
            ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
            
            // Draw mask using 'destination-in' to keep only the person
            const maskImageData = new ImageData(
              new Uint8ClampedArray(mask.data), 
              mask.width, 
              mask.height
            );
            
            // Create a temporary canvas for the mask
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = mask.width;
            tempCanvas.height = mask.height;
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
              tempCtx.putImageData(maskImageData, 0, 0);
              
              ctx.globalCompositeOperation = 'destination-in';
              ctx.drawImage(tempCanvas, 0, 0, canvasElement.width, canvasElement.height);
              
              // Draw background image using 'destination-over'
              ctx.globalCompositeOperation = 'destination-over';
              if (bgImage.complete && bgImage.naturalWidth > 0) {
                // Cover behavior
                const scale = Math.max(canvasElement.width / bgImage.width, canvasElement.height / bgImage.height);
                const x = (canvasElement.width / 2) - (bgImage.width / 2) * scale;
                const y = (canvasElement.height / 2) - (bgImage.height / 2) * scale;
                ctx.drawImage(bgImage, x, y, bgImage.width * scale, bgImage.height * scale);
              } else {
                // Fallback to green screen if image not loaded
                ctx.fillStyle = '#00ff00';
                ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
              }
            }
            ctx.restore();
          } else if (config.type === 'funny' && ctx) {
            // Draw person on top of a filtered background or apply filter to person
            // Example: Alien (Invert Colors) or Pixelate
            ctx.save();
            ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
            
            if (config.value === 'alien') {
               ctx.globalCompositeOperation = 'difference';
               ctx.fillStyle = 'white';
               ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
            } else if (config.value === 'sepia') {
               ctx.filter = 'sepia(100%)';
               ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
            } else if (config.value === 'grayscale') {
               ctx.filter = 'grayscale(100%) contrast(1.2)';
               ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
            } else if (config.value === 'neon') {
               ctx.filter = 'saturate(200%) hue-rotate(90deg) contrast(1.5)';
               ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
            } else if (config.value === 'thermal') {
               ctx.filter = 'saturate(500%) contrast(200%) hue-rotate(120deg) brightness(1.2)';
               ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
            } else if (config.value === 'ghost') {
               ctx.filter = 'invert(80%) sepia(50%) hue-rotate(180deg) blur(2px) contrast(150%) opacity(80%)';
               ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
            } else if (config.value === 'pixelate') {
               const pixelSize = 12;
               const w = canvasElement.width;
               const h = canvasElement.height;
               const tempCanvas = document.createElement('canvas');
               tempCanvas.width = w / pixelSize;
               tempCanvas.height = h / pixelSize;
               const tempCtx = tempCanvas.getContext('2d');
               if (tempCtx) {
                 tempCtx.drawImage(videoElement, 0, 0, tempCanvas.width, tempCanvas.height);
                 ctx.imageSmoothingEnabled = false;
                 ctx.drawImage(tempCanvas, 0, 0, w, h);
                 ctx.imageSmoothingEnabled = true;
               }
            }
            ctx.restore();
          }
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
