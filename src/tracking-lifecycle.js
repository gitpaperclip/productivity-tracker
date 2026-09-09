'use strict';

// Sleep and lock overlap: waking must not resume tracking on the lock screen.
function bindTrackingLifecycle(powerMonitor, tracker) {
  let sleeping = false;
  let locked = powerMonitor.getSystemIdleState(1) === 'locked';
  const update = () => tracker.setSystemInactive(sleeping || locked);
  const handlers = {
    suspend: () => { sleeping = true; update(); },
    resume: () => {
      sleeping = false;
      const state = powerMonitor.getSystemIdleState(1);
      if (state === 'locked') locked = true;
      else if (state === 'active' || state === 'idle') locked = false;
      update();
    },
    'lock-screen': () => { locked = true; update(); },
    'unlock-screen': () => { locked = false; update(); }
  };
  for (const [event, handler] of Object.entries(handlers)) powerMonitor.on(event, handler);
  update();
  return () => {
    for (const [event, handler] of Object.entries(handlers)) powerMonitor.removeListener(event, handler);
  };
}

module.exports = { bindTrackingLifecycle };
