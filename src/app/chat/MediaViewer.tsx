'use client';

import React from 'react';
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Video from "yet-another-react-lightbox/plugins/video";
import Download from "yet-another-react-lightbox/plugins/download";

interface MediaViewerProps {
  url: string;
  type: 'IMAGE' | 'VIDEO';
  onClose: () => void;
}

export default function MediaViewer({ url, type, onClose }: MediaViewerProps) {
  return (
    <Lightbox
      open={true}
      close={onClose}
      plugins={type === 'VIDEO' ? [Zoom, Video, Download] : [Zoom, Download]}
      slides={
        type === 'IMAGE'
          ? [{ type: "image", src: url }]
          : [{
              type: "video",
              width: 1280,
              height: 720,
              autoPlay: true,
              sources: [
                {
                  src: url,
                  type: "video/mp4",
                }
              ],
            }]
      }
      render={{
        buttonPrev: () => null,
        buttonNext: () => null,
      }}
    />
  );
}
