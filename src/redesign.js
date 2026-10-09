// CalmSky_Redesign switch. Unset in production, so the shipped UI is unchanged.
export const CALMSKY = import.meta.env.VITE_CALMSKY_REDESIGN === 'true'
