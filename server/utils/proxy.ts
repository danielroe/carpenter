export function getLoggerProxy<T extends object>(path = ''): T {
  return new Proxy((() => {}) as T, {
    apply(target, thisArg, argArray) {
      console.log(path, ...argArray)
      return true
    },
    get(target, key) {
      return getLoggerProxy(path ? `${path}.${key.toString()}` : key.toString())
    },
  })
}
