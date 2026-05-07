// hero-video.js
document.addEventListener("DOMContentLoaded", () => {
  const video = document.getElementById("hero-video");
  if (!video) return;

  let animationFrameId;

  const updateVideoOpacity = () => {
    if (!video.duration) {
      animationFrameId = requestAnimationFrame(updateVideoOpacity);
      return;
    }

    const currentTime = video.currentTime;
    const duration = video.duration;

    // Fade in over 0.5s
    if (currentTime < 0.5) {
      video.style.opacity = (currentTime / 0.5).toString();
    }
    // Fade out over 0.5s before end
    else if (duration - currentTime < 0.5) {
      video.style.opacity = ((duration - currentTime) / 0.5).toString();
    }
    // Solid in between
    else {
      video.style.opacity = "1";
    }

    animationFrameId = requestAnimationFrame(updateVideoOpacity);
  };

  video.addEventListener("play", () => {
    animationFrameId = requestAnimationFrame(updateVideoOpacity);
  });

  video.addEventListener("pause", () => {
    cancelAnimationFrame(animationFrameId);
  });

  video.addEventListener("ended", () => {
    cancelAnimationFrame(animationFrameId);
    video.style.opacity = "0";
    setTimeout(() => {
      video.currentTime = 0;
      video.play().catch(console.error);
    }, 100);
  });

  // Attempt to auto-play
  video.play().catch(error => {
    console.error("Auto-play failed, usually due to browser policies:", error);
  });
});
