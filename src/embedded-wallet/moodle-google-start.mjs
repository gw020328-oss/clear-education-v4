const navigationHint = 'clear-moodle-google-navigation';

export function takeMoodleGoogleNavigation({location, storage, navigationType, now = Date.now()}) {
  try {
    const value = storage.getItem(navigationHint);
    if (value === null) return false;
    storage.removeItem(navigationHint);
    const issuedAt = Number(value);
    return location.pathname === '/onboarding' && !location.search && !location.hash
      && navigationType === 'navigate' && /^[0-9]{13}$/.test(value)
      && issuedAt <= now && now - issuedAt < 30000;
  } catch {
    return false;
  }
}

export async function claimMoodleGoogleStart(api, signal) {
  const result = await api('/moodle/connect/google-start', {method: 'POST', body: {}, signal});
  return result?.start === true;
}
