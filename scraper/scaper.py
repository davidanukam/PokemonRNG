from utils import *


def scrape(url: str) -> int:
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }

    # Fetch the webpage content
    response = requests.get(url, headers=headers)

    if response.status_code == 200:
        # Parse the HTML content
        soup = BeautifulSoup(response.text, "html.parser")

        quotes = soup.find_all("div", class_="quote")

        for quote in quotes:
            text = quote.find("span", class_="text").text
            author = quote.find("small", class_="author").text
            print(f'"{text}" — {author}\n')
    else:
        print(f"Failed to retrieve data. Status code: {response.status_code}")

    return response.status_code
