# DevFinder

A GitHub user search application that displays user information, statistics, and popular repositories using the GitHub public API.

## Technologies

- HTML5
- CSS3 (Custom animations and effects)
- Vanilla JavaScript (ES6+)
- GitHub REST API v3

## Features

- Real-time GitHub username search with 500ms debounce
- User profile information display (avatar, name, bio, location, company, website)
- Statistics dashboard (repositories, stars, followers, following)
- Top 3 most popular repositories by star count
- Responsive design (desktop, tablet, mobile)
- About modal with project information
- Error handling for API failures and rate limits

## Technical Overview

### Architecture

The application follows a simple client-side architecture:

1. **API Integration**: Fetches data from GitHub's public API endpoints

   - `/users/{username}` - User profile data
   - `/users/{username}/repos` - User repositories

2. **Data Processing**:

   - Calculates total stars across all repositories
   - Sorts repositories by star count
   - Formats dates and statistics for display

3. **UI Rendering**: Dynamic HTML generation with template literals

### Key Components

- **Search Input**: Header-positioned search with custom styling and glow effects
- **User Card**: Full-screen modal displaying user data with flexbox layout
- **Loading States**: Animated loading indicator during API requests
- **Error Handling**: User-friendly error messages for 404 and rate limit errors

### CSS Features

- Custom scrollbars
- Gradient backgrounds and glow effects
- Reflection and shine animations on input
- Smooth transitions and hover effects
- Media queries for responsive breakpoints (1024px, 768px, 480px, 360px)

## Usage

1. Clone the repository
2. Open `index.html` in a web browser
3. Enter a GitHub username in the search bar
4. View user information and repositories

No build process or dependencies required.

## API Rate Limits

The GitHub API allows 60 requests per hour for unauthenticated requests. The application displays an error message when the rate limit is exceeded.

## Browser Compatibility

Modern browsers with ES6+ support required:

- Chrome 51+
- Firefox 54+
- Safari 10+
- Edge 15+

## Author

Renato Khael - [LinkedIn](https://www.linkedin.com/in/rkhael/)
