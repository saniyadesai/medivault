import HeroCarousel from './HeroCarousel';
import { Link } from 'react-router-dom';

const VALUE_POINTS = [
    {
        icon: (
            <svg viewBox="0 0 20 20" fill="none">
                <path d="M10 2L3 6v4c0 4 3.1 7.6 7 8.9C13.9 17.6 17 14 17 10V6L10 2z"
                    stroke="#a8447f" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
        ),
        text: 'Patient-controlled health records',
    },
    {
        icon: (
            <svg viewBox="0 0 20 20" fill="none">
                <rect x="3" y="3" width="14" height="14" rx="3" stroke="#a8447f" strokeWidth="1.8" />
                <path d="M7 10l2 2 4-4" stroke="#a8447f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
        text: 'Secure access for doctors and hospitals',
    },
    {
        icon: (
            <svg viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="7" stroke="#a8447f" strokeWidth="1.8" />
                <path d="M10 6v4l2.5 2" stroke="#a8447f" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
        ),
        text: 'Emergency data access when life depends on it',
    },
    {
        icon: (
            <svg viewBox="0 0 20 20" fill="none">
                <path d="M4 5h12M4 10h12M4 15h8" stroke="#a8447f" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
        ),
        text: 'Full transparency with audit logs',
    },
];

const scrollTo = (id) => (e) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

export default function Hero() {
    return (
        <section className="hero" id="hero">
            <div className="container hero-grid">
                {/* Left: Text */}
                <div className="hero-text">
                    <div className="hero-eyebrow">Healthcare, Reimagined</div>
                    <h1 className="hero-headline">
                        A Secure Digital Vault for Your Medical Records.
                    </h1>
                    <p className="hero-description">
                        Store, manage, and share your health records securely.
                        Doctors get the right information when it matters most — especially in emergencies.
                    </p>

                    <ul className="hero-value-list">
                        {VALUE_POINTS.map((vp, i) => (
                            <li key={i}>
                                <span className="vp-icon">{vp.icon}</span>
                                {vp.text}
                            </li>
                        ))}
                    </ul>

                    <div className="hero-ctas">
                        <Link to="/register/patient" className="btn btn-primary btn-lg">Get Started</Link>
                        <a href="#flow" className="btn btn-outline btn-lg" onClick={scrollTo('flow')}>
                            See How It Works
                        </a>
                    </div>
                </div>

                {/* Right: Carousel */}
                <HeroCarousel />
            </div>
        </section>
    );
}
