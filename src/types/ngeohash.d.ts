declare module 'ngeohash' {
  const geohash: {
    encode: (lat: number, lon: number, numberOfChars?: number) => string
    decode: (hash: string) => {
      latitude: number
      longitude: number
      error?: { latitude: number; longitude: number }
    }
    neighbors: (hash: string) => string[]
  }
  export default geohash
}

