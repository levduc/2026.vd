// Simple scroll reveal
document.addEventListener('DOMContentLoaded', () => {
    // Add simple entrance animation to cards
    const cards = document.querySelectorAll('.feature-card, .stat-card');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = 1;
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.1 });

    cards.forEach((card, index) => {
        card.style.opacity = 0;
        card.style.transform = 'translateY(20px)';
        card.style.transition = `all 0.6s ease ${index * 0.1}s`;
        observer.observe(card);
    });

    // Mock Connect Button interaction
    const btn = document.getElementById('connect-wallet');
    btn.addEventListener('click', () => {
        btn.textContent = 'Connecting...';
        setTimeout(() => {
            btn.textContent = '0x12..AB34';
            btn.style.borderColor = '#00CC66';
            btn.style.color = '#00CC66';
        }, 1500);
    });
});
