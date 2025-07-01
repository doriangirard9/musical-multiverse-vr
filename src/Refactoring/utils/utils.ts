/**
 * Ajoute un timeout à une promesse
 * @param promise La promesse originale
 * @param timeoutMs Délai avant timeout en millisecondes
 * @param fallbackValue Valeur retournée en cas de timeout (optionnel)
 * @param timeoutMessage Message d'erreur ou de log (optionnel)
 */
export function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    fallbackValue?: T,
    timeoutMessage: string = "Operation timed out"
): Promise<T> {
    let timeoutId: number

    const timeoutPromise = new Promise<T>((resolve, reject) => {
        timeoutId = setTimeout(() => {
            console.warn(`TIMEOUT: ${timeoutMessage}`);
            if (fallbackValue !== undefined) {
                resolve(fallbackValue);
            } else {
                reject(new Error(timeoutMessage));
            }
        }, timeoutMs);
    });

    return Promise.race([
        promise.then(result => {
            clearTimeout(timeoutId);
            return result;
        }).catch(error => {
            clearTimeout(timeoutId);
            throw error;
        }),
        timeoutPromise
    ]);
}