
/**
 * Get the current client location, including the route and query parameters.
 * This function parses the URL hash to extract the route and parameters.
 * It returns an object containing the full location, the route as an array, the route as a string, and the query parameters.
 * @return An object with the following properties:
 * - `location`: The full URL hash (e.g., "#/path/to/page?param=value").
 * - `route`: An array of strings representing the route segments (e.g., ["", "path", "to", "page"]).
 * - `str_route`: The route as a string without query parameters (e.g., "/path/to/page").
 * - `params`: A URLSearchParams object containing the query parameters (e.g., { param: "value" }).
 */
export function getClientLocation(){
    const hash = document.location.hash
    const [path,rest] = hash.split("?")
    const params = new URLSearchParams(rest??"")
    const splited_path = path.split("/")
    return {
        locaton: hash,
        route: splited_path,
        str_route: path,
        params,
    }
}