interface HeaderProps {
  onScrollToApp: () => void
}

export default function Header({ onScrollToApp }: HeaderProps) {
  return (
    <header>
      <div className="nav">
        <div className="brand">
          <div className="brand-logo">🌿</div>
          <div>
            <div className="brand-name">PasokanAI</div>
          </div>
        </div>
        <button className="nav-cta" onClick={onScrollToApp}>Mulai Tanya 🌱</button>
      </div>
    </header>
  )
}
