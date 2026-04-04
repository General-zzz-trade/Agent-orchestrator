import type { BenchmarkTask } from "./tasks";

/**
 * External website benchmark tasks — validates the agent against real public websites.
 *
 * These tasks do NOT require the sample app. They use open_page directly
 * against stable, public websites with no authentication.
 */
export function getExternalBenchmarkTasks(): BenchmarkTask[] {
  return [
    // Wikipedia (stable, public, no auth)
    {
      id: "EXT01",
      name: "Open Wikipedia main page",
      difficulty: "trivial",
      category: "navigation",
      goal: 'open page "https://en.wikipedia.org" and assert text "Wikipedia" and screenshot',
      verify: r => r.result?.success === true,
      description: "Navigate to Wikipedia and verify it loaded"
    },
    {
      id: "EXT02",
      name: "Search Wikipedia",
      difficulty: "simple",
      category: "search",
      goal: 'open page "https://en.wikipedia.org" and type "#searchInput" value "TypeScript" and click "#searchButton" and assert text "TypeScript" and screenshot',
      verify: r => r.result?.success === true,
      description: "Search for TypeScript on Wikipedia"
    },
    {
      id: "EXT03",
      name: "Navigate Wikipedia article links",
      difficulty: "medium",
      category: "multi-step",
      goal: 'open page "https://en.wikipedia.org/wiki/TypeScript" and click "a[title=\'JavaScript\']" and assert text "JavaScript" and screenshot',
      verify: r => r.result?.success === true,
      description: "Navigate from TypeScript to JavaScript article"
    },

    // Hacker News (stable, public, simple DOM)
    {
      id: "EXT04",
      name: "Open Hacker News",
      difficulty: "trivial",
      category: "navigation",
      goal: 'open page "https://news.ycombinator.com" and assert text "Hacker News" and screenshot',
      verify: r => r.result?.success === true,
      description: "Navigate to Hacker News"
    },
    {
      id: "EXT05",
      name: "Navigate HN sections",
      difficulty: "simple",
      category: "navigation",
      goal: 'open page "https://news.ycombinator.com" and click "a[href=\'newest\']" and assert text "New Links" and screenshot',
      verify: r => r.tasks?.some((t: any) => t.type === "open_page" && t.status === "done") === true,
      description: "Click 'new' link on Hacker News"
    },

    // Example.com (most stable site on the internet)
    {
      id: "EXT06",
      name: "Example.com basic",
      difficulty: "trivial",
      category: "assertion",
      goal: 'open page "https://example.com" and assert text "Example Domain" and screenshot',
      verify: r => r.result?.success === true,
      description: "Load example.com and verify content"
    },

    // Natural language goals against Wikipedia
    {
      id: "EXT07",
      name: "NL: Find info about Rust language",
      difficulty: "complex",
      category: "search",
      goal: 'open page "https://en.wikipedia.org" and search for "Rust programming language" and verify the page is about Rust',
      verify: r => r.tasks?.some((t: any) => t.status === "done" && t.type === "open_page") === true,
      description: "Natural language search on Wikipedia (tests NL understanding)"
    },

    // httpbin.org (testing API handling)
    {
      id: "EXT08",
      name: "HTTP API test",
      difficulty: "simple",
      category: "assertion",
      goal: 'http_request "https://httpbin.org/get"',
      verify: r => r.result?.success === true || r.tasks?.some((t: any) => t.type === "http_request" && t.status === "done"),
      description: "Make HTTP request to httpbin"
    },
  ];
}
