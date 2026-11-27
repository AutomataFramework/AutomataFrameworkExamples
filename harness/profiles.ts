// The three screens every game is played on in CI. Browser profiles emulate a screen size and touch: that is
// emulation evidence, not proof of how a real phone performs.
export type ProfileName = 'phone' | 'tablet' | 'computer'

export type Profile = {
  viewport: { width: number; height: number }
  deviceScaleFactor: number
  isMobile: boolean
  hasTouch: boolean
}

export const profiles: Record<ProfileName, Profile> = {
  phone: { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  tablet: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  computer: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
}
