declare module 'randomcolor' {
  interface RandomColorOptions {
    hue?: string | number
    luminosity?: 'bright' | 'light' | 'dark' | 'random'
    count?: number
    seed?: number | string
    format?: 'rgb' | 'rgba' | 'rgbArray' | 'hsl' | 'hsla' | 'hslArray' | 'hex'
    alpha?: number
  }

  function randomColor(options?: RandomColorOptions): string
  function randomColor(options: RandomColorOptions & { count: number }): string[]

  export = randomColor
}
