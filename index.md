---
layout: page
---

# Hi, I'm Alex.

I'm a Computer Science student from
[Thessaloniki](https://www.britannica.com/summary/Thessaloniki). I like to
dabble in different technologies and read about computers and linguistics. I'm
interested in Systems Programming and Distributed Systems. In the past I have
worked on numerous Java-based projects around Game Servers.

# Writing
<ul>
  {% for post in site.posts %}
    <li>
      <a href="{{ post.url }}">{{ post.title }}</a>
    </li>
  {% endfor %}
</ul>
