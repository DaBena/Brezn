import 'react'

declare module 'react' {
  // HTML media elements support referrerpolicy; React's VideoHTMLAttributes omit it.
  // https://html.spec.whatwg.org/multipage/media.html#attr-media-referrerpolicy
  interface MediaHTMLAttributes<T> {
    referrerPolicy?: HTMLAttributeReferrerPolicy | undefined
  }
}
