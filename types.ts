declare const bootstrap: typeof import("bootstrap")

interface Data {
  id: string
  path: string
  pageCount: number
  artist: string
  artistId: string
  description: string
  notes: Note[]
}
interface Note {
  page: number
  x: number
  y: number
  w: number
  h: number
  text: string
}
