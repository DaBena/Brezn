import 'react'

declare module 'react' {
  // HTML media elements support referrerpolicy; React's VideoHTMLAttributes omit it.
  // https://html.spec.whatwg.org/multipage/media.html#attr-media-referrerpolicy
  // Type param must stay `T` to merge with React's MediaHTMLAttributes<T>.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by declaration merge
  interface MediaHTMLAttributes<T> {
    referrerPolicy?: HTMLAttributeReferrerPolicy | undefined
  }
}
