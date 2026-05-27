export default function Feedback() {
  const reviews = [
    {
      text: 'Absolutely loved everything about this venue. The entrance, gardens and interiors were stunning. Perfect for our family celebration!',
      author: 'Rajesh Kumar'
    },
    {
      text: "We had my daughter's wedding at Ashok Palace and it was everything we dreamed of. The grandeur and professional team made it perfect!",
      author: 'Priya & Arun'
    },
    {
      text: "My wife's baby shower was absolutely beautiful. The palace interiors made us feel like royalty. Thank you for making it special!",
      author: 'Vikram Singh'
    }
  ]

  return (
    <section className="testimonials-section">
      <div className="testimonials-container">
        <h2>Precious Remarks from Our Guests</h2>
        <div className="testimonials-grid">
          {reviews.map((review, idx) => (
            <div key={idx} className="testimonial-card">
              <p className="review-text">"{review.text}"</p>
              <p className="review-author">— {review.author}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
