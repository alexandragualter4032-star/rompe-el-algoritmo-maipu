import { useState } from 'react';
import { getPhotoFallbackSvg } from '../components/placeholders.js';

export function ArtistImage({ artist, src, alt, className = '', priority = false }) {
  const [failed, setFailed] = useState(false);
  return <img
    className={className}
    src={failed || !src ? getPhotoFallbackSvg(artist) : src}
    alt={alt}
    loading={priority ? 'eager' : 'lazy'}
    decoding="async"
    onError={() => setFailed(true)}
  />;
}
