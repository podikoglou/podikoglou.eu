---
title: "Designing an Optimal ISA for my Superoptimizer"
layout: default
date: 2025-02-25
draft: true
categories:
- superr
- superoptimizer
- vm
- cpu
---

# {{ page.title }}

This is more of a development log than an article, which I usually put on here,
but I felt the need to write some of my thoughts down, as they may help someone
in the future (likely in an alternate universe). It also serves as a form of
[learning in public][1], which I've recently
seen being popular.

Over the past month or so I've been [rethinking][2] my project [superr][3].
Superr is a toy project I've been working on for the past year on-and-off,
where I explore [superoptimization][4]. The project (currently) consists of:

1. A **VM** with a custom instruction set (based on [Austin Henley's][7])

2. An **Assembly language** (which the VM parses directly, as programs written
   for it are nothing more than [opcodes][5] followed by [operands][6]

3. Two **superoptimization strategies**: **Random Search** and **Exhaustive**

Currently, there are several things that are wrong with this approach:

1. The VM uses neither registers nor a stack -- it simply has a byte array
   for memory which is referenced by its indices.

2. The assembly is being parsed by the VM directly, rather than having some
   sort of bytecode format.

These architectural decisions are not ideal, primarily because they are not
very similar to how actual CPUs or language VMs work. Ideally, they should feel
at least a little bit familiar to both assembly programmers, and designers of
language VMs.

It should be noted that the original design choices were based on no prior
experience with VMs, CPUs or similar topics and were very rough.

[1]: https://www.swyx.io/learn-in-public
[2]: https://github.com/podikoglou/superr/tree/qua
[3]: https://podikoglou.eu/rust/superr/vm/2024/07/13/writing-a-superoptimization-toolchain.html
[4]: https://en.wikipedia.org/wiki/Superoptimization
[5]: https://en.wikipedia.org/wiki/Opcode
[6]: https://en.wikipedia.org/wiki/Operand#Computer_science
[7]: https://austinhenley.com/blog/superoptimizer.html
