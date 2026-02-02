/**
 * Default constraints for video capture.
 * Optimized for golf swing analysis - prioritizes frame rate over resolution.
 */
export const getVideoConstraints = (useFrontCamera = false) => ({
  facingMode: useFrontCamera ? 'user' : 'environment',
  width: { ideal: 1280, max: 1920 },
  height: { ideal: 720, max: 1080 },
  frameRate: { ideal: 60, min: 30 },
});

/**
 * Audio constraints for capture.
 * Disabled echo cancellation since we're doing one-way streaming.
 */
export const getAudioConstraints = () => ({
  echoCancellation: false,
  noiseSuppression: true,
  autoGainControl: true,
});

/**
 * Complete media stream constraints.
 */
export const getMediaConstraints = (options: { video?: boolean; audio?: boolean; useFrontCamera?: boolean } = {}) => {
  const { video = true, audio = true, useFrontCamera = false } = options;

  return {
    video: video ? getVideoConstraints(useFrontCamera) : false,
    audio: audio ? getAudioConstraints() : false,
  };
};

/**
 * SDP constraints for creating offers/answers.
 * Configures the connection for one-way video streaming.
 */
export const getOfferConstraints = () => ({
  mandatory: {
    OfferToReceiveVideo: false,
    OfferToReceiveAudio: false,
  },
});

/**
 * SDP constraints for the viewer (receiving) side.
 */
export const getAnswerConstraints = () => ({
  mandatory: {
    OfferToReceiveVideo: true,
    OfferToReceiveAudio: true,
  },
});
