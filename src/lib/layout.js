// スマホの固定下部ナビに関する共通寸法。
// 本文・通知・ナビ本体が同じ値を参照し、safe area のある端末でも重ならないようにする。
export const MOBILE_NAV_CONTENT_HEIGHT = 56
export const MOBILE_NAV_SAFE_AREA = 'env(safe-area-inset-bottom, 0px)'

// 固定要素との間に少し余白を残す。Snackbar の bottom はナビの外側から指定する。
export const MOBILE_NAV_GUTTER = 16
export const MOBILE_CONTENT_BOTTOM_PADDING_FALLBACK = `${MOBILE_NAV_CONTENT_HEIGHT + MOBILE_NAV_GUTTER}px`
export const MOBILE_CONTENT_BOTTOM_PADDING = `calc(${MOBILE_NAV_CONTENT_HEIGHT}px + ${MOBILE_NAV_SAFE_AREA} + ${MOBILE_NAV_GUTTER}px)`
export const MOBILE_SNACKBAR_BOTTOM = MOBILE_CONTENT_BOTTOM_PADDING
