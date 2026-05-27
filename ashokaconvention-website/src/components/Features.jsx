const items = [
  {title:'Event Management',desc:'Create and manage event schedules, speakers, and venues.'},
  {title:'Attendee Registration',desc:'Seamless registration flows with payment integrations.'},
  {title:'Analytics',desc:'Insights and reporting to measure engagement and reach.'}
]

export default function Features(){
  return (
    <section id="features" className="features">
      {items.map((it)=> (
        <div className="card" key={it.title}>
          <h3>{it.title}</h3>
          <p>{it.desc}</p>
        </div>
      ))}
    </section>
  )
}
