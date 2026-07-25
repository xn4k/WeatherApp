const descriptions = {
    0: 'Klar',
    1: 'Überwiegend klar',
    2: 'Teilweise bewölkt',
    3: 'Bedeckt',
    45: 'Nebel',
    48: 'Reifnebel',
    51: 'Leichter Nieselregen',
    53: 'Nieselregen',
    55: 'Starker Nieselregen',
    61: 'Leichter Regen',
    63: 'Regen',
    65: 'Starker Regen',
    71: 'Leichter Schneefall',
    73: 'Schneefall',
    75: 'Starker Schneefall',
    80: 'Leichte Regenschauer',
    81: 'Regenschauer',
    82: 'Starke Regenschauer',
    95: 'Gewitter',
    96: 'Gewitter mit Hagel',
    99: 'Starkes Gewitter mit Hagel',
};
export function weatherLabel(code) {
    return descriptions[code] ?? 'Wechselhaft';
}
export function windDirection(degrees) {
    const directions = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
    return directions[Math.round(degrees / 45) % 8];
}
export function formatTime(value) {
    if (!value)
        return '—';
    return new Intl.DateTimeFormat('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value));
}
export function formatUpdated(value) {
    return new Intl.DateTimeFormat('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
    }).format(new Date(value));
}
