export {}

declare global {
  interface Window {
    WAMExtensions?: {
      notes?: any
      patterns?: any
      video?: any
      [key: string]: any
    }
  }
}
