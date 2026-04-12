import { useEffect, useRef, useState } from 'react'

export function useNavigation() {
  const [showNav, setShowNav] = useState(true)
  const lastScrollY = useRef(0)

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY
      if (currentScrollY < 10) {
        setShowNav(true)
      } else if (currentScrollY > lastScrollY.current) {
        setShowNav(false)
      } else {
        setShowNav(true)
      }
      lastScrollY.current = currentScrollY
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return {
    showNav,
  }
}
