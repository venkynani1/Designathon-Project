export function loadFromStorage(key, fallbackValue) {
  try {
    const savedValue = window.localStorage.getItem(key)
    return savedValue ? JSON.parse(savedValue) : fallbackValue
  } catch {
    return fallbackValue
  }
}

export function saveToStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    return false
  }

  return true
}
