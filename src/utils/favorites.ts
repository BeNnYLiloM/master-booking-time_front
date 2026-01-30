// Сервис для работы с избранными мастерами в localStorage
const FAVORITES_KEY = 'masterbookbot_favorites';

export const favoritesService = {
  // Получить список избранных
  getFavorites(): number[] {
    try {
      const stored = localStorage.getItem(FAVORITES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },

  // Добавить в избранное
  addFavorite(masterId: number): void {
    const favorites = this.getFavorites();
    if (!favorites.includes(masterId)) {
      favorites.push(masterId);
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    }
  },

  // Удалить из избранного
  removeFavorite(masterId: number): void {
    const favorites = this.getFavorites();
    const filtered = favorites.filter(id => id !== masterId);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(filtered));
  },

  // Проверить в избранном ли
  isFavorite(masterId: number): boolean {
    return this.getFavorites().includes(masterId);
  },

  // Переключить избранное
  toggleFavorite(masterId: number): boolean {
    if (this.isFavorite(masterId)) {
      this.removeFavorite(masterId);
      return false;
    } else {
      this.addFavorite(masterId);
      return true;
    }
  }
};
