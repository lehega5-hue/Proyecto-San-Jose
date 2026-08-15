(() => {
  const landing = document.querySelector("#welcome-view.landing-page");
  if (!landing) return;

  const heroThread = landing.querySelector(".landing-thread--hero");
  const replayTargets = [
    landing.querySelector(".landing-method"),
    landing.querySelector(".landing-access")
  ].filter(Boolean);
  const targets = [heroThread, ...replayTargets].filter(Boolean);

  const revealAll = () => targets.forEach((target) => target.classList.add("is-revealed"));
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  if (reducedMotion || !("IntersectionObserver" in window)) {
    revealAll();
    return;
  }

  landing.classList.add("landing-motion-ready");

  const ENTER_RATIO = 0.18;
  const EXIT_RATIO = 0.02;
  const armed = new WeakMap(targets.map((target) => [target, true]));

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.intersectionRatio >= ENTER_RATIO && armed.get(entry.target)) {
        entry.target.classList.add("is-revealed");
        armed.set(entry.target, false);
        return;
      }

      if (entry.intersectionRatio <= EXIT_RATIO && !armed.get(entry.target)) {
        entry.target.classList.remove("is-revealed");
        armed.set(entry.target, true);
      }
    });
  }, {
    threshold: [0, EXIT_RATIO, ENTER_RATIO],
    rootMargin: "-34% 0px -10% 0px"
  });

  replayTargets.forEach((target) => observer.observe(target));

  if (heroThread) {
    const threadObserver = new IntersectionObserver(([entry]) => {
      heroThread.classList.toggle("is-revealed", entry.isIntersecting);
    }, {
      threshold: 0.2,
      rootMargin: "0px 0px -6% 0px"
    });
    threadObserver.observe(heroThread);
  }
})();
