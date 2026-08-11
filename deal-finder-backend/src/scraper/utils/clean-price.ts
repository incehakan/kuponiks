/**
 * Shared Turkish / locale price cleaner for all scraper adapters.
 * Delegates to the Core V2.1 numeric parser.
 */
export { parsePrice as cleanPrice, parsePrice } from "./parse-number.js";
