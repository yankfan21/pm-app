function AppHeader() {
  return (
    <>
      <h1 className="app-title">
        <span className="app-title-mark" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
          </svg>
        </span>
        PM-App
      </h1>
      <p className="app-subtitle">Your Project Management Assistant</p>
    </>
  )
}

export default AppHeader
