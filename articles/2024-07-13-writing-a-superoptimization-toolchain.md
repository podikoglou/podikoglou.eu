---
tags: article
title: "Superr: A VM and Superoptimization Toolchain"
layout: default
date: 2024-07-13
categories:
- rust
- superr
- vm
---

# {{ page.title }}

_Last Updated on July 23rd_

_All the code is [on my GitHub][1]_

## Prelude

I started this project about [a year ago][2], when I read [this article by
Austin Henley][3] and was inspired to replicate his efforts in a faster
language, hoping to see better results.

In case you don't know what a [Superoptimizer][4] is, it's pretty simple: it's
an algorithm that tries to rewrite a given program with as little instructions
as possible.

Austin's blog post implemented a very simple VM which uses an equivalently
simple instruction set, and on top of it, a _superoptimizer_, which worked by
generating _all_ possible programs which are equivalent to the input program.
The way we can see whether two programs are equivalent is by executing both of
them, on different VMs, and comparing the memories. If the memory of the first
VM (the one that executed the given program) is the same as the memory of the
second VM, then we know that the programs did the exact same thing. Doesn't
matter _how_ they did it.

## Meet Superr

Superr is what I named the project. It consists of three crates (subprojects):

- **superr_vm**: Library for creating VMs and running programs on them
- **superr_optimizers**: Library for optimizing programs
- **superr**: the CLI interface to the toolchain

Naturally, the superr crate uses the two other libraries.

### The VM

I used the exact same instruction set as Austin's VM, so that they can both be
easily compared (also, it's an extremely simple one).

PS: I'm planning on adding more instructions in the future.

```rust
enum Instruction {
    Load(usize),
    Swap(MemoryAddress, MemoryAddress),
    XOR(MemoryAddress, MemoryAddress),
    Inc(MemoryAddress),
}
```

This enum defines the instructions and the operands each one takes.

- the **LOAD** instruction takes a number, which is to be loaded at the address **0**
- the **SWAP** instruction takes two addresses, which are to be swapped with eachother
- the **XOR** instruction takes two addresses, performs an XOR operation
  between the values at these two addresses, and stores the result back in the
  first address
- the **INC** instruction takes an address, which it increments the value in that address by 1

#### Memory

The memory is super simple. It's an array of 6 usize-sized numbers. Keep in
mind that increasing the amount of memory there is, increases the complexity of
the superoptimization algorithm.

```rust
const MEM_SIZE: usize = 6;

struct VM {
    state: [usize; MEM_SIZE],
    ...
}
```

Since the memory (which will now be referred to as state) is just an array,
addresses are just the indices of the values in the array.

```rust
pub type MemoryAddress = usize;
```

#### Executing Programs

A program is simply a list of instructions (operands included), so we simply
just... loop through the instructions and mutate the state based on them.

```rust
fn execute_program(&mut self, program: Program) {
    for instruction in program.instructions {
        self.execute(instruction);
    }
}
```

```rust
fn execute(&mut self, instruction: Instruction) {
    match instruction {
        Instruction::Load(val) => {
            self.state[0] = val;
        }

        Instruction::Swap(a, b) => {
            self.state.swap(a, b);
        }

        Instruction::XOR(a, b) => {
            self.state[a] = self.state[a] ^ self.state[b];
        }

        Instruction::Inc(addr) => {
            self.state[addr] += 1;
        }
    }
}
```

##### An Example Program

Now that I've explained how the VM works, let's see an example program.

```
INC 1
INC 2
INC 2
INC 3
INC 3
INC 3
```

When we run this program, it produces the following state (i.e. this is the
memory of the VM when the program is done executing): `[0, 1, 2, 3, 0, 0]`

**Keep in mind**: Addresses start from 0

What the superoptimizer will do is, it'll try to generate many programs like
this, and _hopefully_, it will eventually stumble across the following program,
which has fewer instructions.

```
LOAD 2
SWAP 0 1
LOAD 3
SWAP 0 2
LOAD 1
```

### The Optimizers

I figured that there's not just a single superoptimizer that I can implement:
there's multiple algorithms for superoptimization. Therefore, I decided upon a
structure that will help me implement multiple Superoptimizers and run them
through superr, letting the user pick which one they want to use.

```rs

pub trait Optimizer {
    /// The options of the program, such as the biggest value an instruction
    /// operand can be, max instructions a program can have, etc.
    type Options;

    /// The state of the program, holding things such as the optimal program, whether
    /// to stop, programs checked, etc.
    type State;

    /// Creates a new instance of the Optimizer.
    fn new(options: Self::Options, program: Program) -> Self;

    /// Starts the optimization process.
    ///
    /// It starts multiple threads using rayon:
    ///   - one for reporting the progress
    ///   - and the rest of the available threads, for computing the optimal program.
    ///
    /// It also joins the threads, meaning that this function is blocking, until
    /// the threads are stopped.
    ///
    /// Returns the program using [`Optimizer::optimal`] when finished.
    fn start_optimization(&mut self) -> Program;

    /// Gets the optimal version of the program.
    ///
    /// When the superoptimizer is created, the variable behind this is initialized
    /// with the initially given program, so if no optimal program was found,
    /// the given program is returned, thus not needing to return an [Option]
    fn optimal(&mut self) -> Program;

    /// Returns the length of the optimal program. 'current' refers to the fact that
    /// we're not necessarily returning the optimal length of the program, but the
    /// length of what we know to be the optimal program at this point.
    fn current_optimal_length(&self) -> usize;

    /// This function is used within the threads of the optimizer, and checks
    /// whether to stop based on the state of the program.
    ///
    /// Implementations should use this method function, rather than using the
    /// state's should_stop variable directly, as in some implementations there
    /// may be other variables involved with whether the program should stop.
    fn should_stop(&self) -> bool;

    /// Runs the worker loop, constantly generating and checking
    /// programs until it finds an optimal program.
    fn work(&self);

    /// Runs the progress loop, constantly updating the progress bar.
    fn progress_loop(&self);
}
```

As you can see, I have added the possibility for the superoptimizers to take
advantage of multi-threading.

#### Optimizer #1: Random Search

The Random Search Superoptimizer was the first optimizer I implemented. The
algorithm is the following:

```rs

// state of the algorithm
let mut optimal: Program = ...;
let target_state = VM::compute_state(&optimal);

// continuously generate programs and check whether they're equivalent
// to the program which we know to be the most optimal
while !self.should_stop() {
    let program = self.generate_program();
    let state = VM::compute_state(&program);

    if target_state == state {
        if program.instructions.len() < optimal.instructions.length() {
            optimal = program;
            target_state = state;
        }
    }
}
```

You may notice a few functions which I haven't discussed yet:
`generate_program` and `VM::compute_state()`.

##### generate_program()

[`generate_program`][5]
randomly generates a program. The variables that are randomized are the
following:

- amount of instructions (which can be limited using the `--max-instructions`
  CLI flag)
- which instructions appear in the program (there can be duplicates)
- the order in which the instructions appear
- the arguments to the operands of the functions.

Some instructions such as `INC`, take a numeric value as an operand. Since we
want these numeric values to be within a certain range for efficiency reasons,
there is a CLI flag `--max-num` for setting the bounds of the randomly
generated values.

##### VM::compute_state()

As for `VM::compute_state()`, the function creates a **temporary** VM, executes
a given program, and returns the memory after it's finished.

There may be some conceerns about whether creating millions of VMs per second
is performant. I have figured out after hours of optimization that it is
practically not very different performance-wise from having a pool of VMs. In
fact, it might even be faster. Keep in mind that a `VM` is pretty much an array
which is the memory. Not much more.

**Back to the algorithm**: this loop continues until Ctrl-C is pressed, where
the algorithm stops and superr prints the most optimal equivalent program it
has found.

##### Usage

To use the Random Search Optimizer, you must pipe a program into `superr
optimize`:

```
superr gen | superr optimize --optimizer random --max-instuctions 8 --max-num
```

I've created the `superr gen` command, which randomly generates programs for
testing purposes, and you may use it for the purpose of testing out the tool.
(options like `--instructions` can be passed as CLI arguments.)

##### Benchmarks

The Random Search Optimizer, on my M1 Mac, using multithreading, can achieve up
to **15,000,000 searches / sec**.

Here's the Random Search Optimizer in action:

<script src="https://asciinema.org/a/lPXdhA4VgsXMW8zugwjRF8tPg.js" id="asciicast-lPXdhA4VgsXMW8zugwjRF8tPg" async="true"></script>

#### Optimizer #2: Exhaustive Search

I'm still working on the implementation of this optimizer. [Although it's
functional][6], there are lots of optimizations and code improvement that need
to be done before I present it here.

[1]: https://github.com/podikoglou/superr
[2]: https://github.com/podikoglou/superr/commit/5f053cb508cc2e700a8e4cde82605513d487cc0d
[3]: https://austinhenley.com/blog/superoptimizer.html
[4]: https://en.wikipedia.org/wiki/Superoptimization
[5]: https://github.com/podikoglou/superr/blob/9e4426ddbff875f235c96b9f6b9a3402f3ef5934/superr_optimizers/src/optimizers/random_search.rs#L191
[6]: https://github.com/podikoglou/superr/blob/main/superr_optimizers/src/optimizers/exhaustive.rs
