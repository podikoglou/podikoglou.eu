---
title: "Transpiling TypeScript to C"
layout: article
date: 2024-08-13
categories:
- compiler
- transpiler
- c
- typescript
---

# {{ page.title }}

The code for this project is [available on GitHub](https://github.com/podikoglou/type-c).

## Preamble

I recently noticed that some people don't know what a transpiler is. I figured
that it's because it's a relatively new term (or rather, it [only
recently](https://github.com/babel/babel/commit/c97696c224d718d96848df9e1577f337b45464be)
started getting traction). Some people [even refuse to use the
term](https://rachit.pl/post/transpiler/), which I understand, to a certain
extent.

**In short**: a Transpiler is a Source-to-source compiler.

<hr>

Over the past few days, I've been working on a little program which transpiles
TypeScript into C. It's called `type-c`. This is a fairly hard task, since the
two languages follow two completely different paradigms. Thankfully, TypeScript
exists, and with its (partially) static typing system, relating the code to
other statically typed languages becomes more manageable.

`type-c` doesn't do much. It doesn't inject polyfills into your code, so your
TypeScript program must adapt to C's conventions and paradigm. That goes
without saying that it doesn't implement JavaScript's or TypeScript's standard
library, including `console`, `Array`, or any FP-related functions like
`forEach` or `map`.

This design choice made the project's goal clearer: to be able to write C with
the syntax of TypeScript. Obviously, there's no particular reason that anyone
would want to do this, but it's a fun experiment.

I will talk about the specifics of how I implemented the transpiler in a little
bit. For now, I'll show you what `type-c` code looks like.

I mentioned the fact that `type-c` doesn't expose a `console` object, so how
does one log something? the answer is `printf`.

```typescript
printf("Hello, C!\n");
```

But that's not a correct `type-c` program. You need to export a `main`
function, just like C programs. Oh, and you need to import `printf`.

```typescript
import { printf } from "stdio.h";

export function main(argc: number, argv: string[]): number {
  printf("Hello, C!\n");
  return 0;
}
```

This obviously compiles to the following:

```c
#include <stdio.h>

int main(int argc, char** argv) {
  printf("Hello, C!\n");
  return 0;
}
```

You may notice the import -- it imports the `printf` function from the
`stdio.h` module. When this is transpiled, the items which are imported aren't
really taken into consideration, but you _do_ need to import something, so that
the header file is included.

This also applies to booleans due to the nature of C.

```ts
import { true, false } from "stdbool.h";
```

You may also notice that we only really have one number type: `number`, which
is just translated to `int` in C. That is because JS/TS uses a single type for
all kinds of numbers (an `f64`). Obviously, making the `number` type equivalent
to a 64 bit float in C is stupid and wasteful. What would the main function
even return?

One thing that was fun to implement was pointers. TypeScript obviously won't
allow us to use the `&` and `*` characters like we do in C, so I opted for a
solution that is more native to TypeScript.

```typescript
let foo: number = 8;
let fooPtr: Pointer<number> = ptr(foo);

foo = deref(fooPtr);
```

This transpiles to:

```c
int foo = 8;
int *fooPtr = &foo;

foo = *fooPtr;
```

`ptr` and `deref` are currently the only builtin functions. They're obviously
not implemented in TypeScript, but this is what their declarations would look
like:

```typescript
declare function ptr<T>(value: T): Pointer<T>;
declare function deref<T>(value: Pointer<T>): T;
```

Although these make sense as declarations, they don't make a lot of sense due
to JavaScript's nature of passing primitive arguments by value and not by
reference.

Since pointers work, I also implemented arrays. Well, sort of. I didn't really
know how to implement fixed-size arrays due to the limitations of TypeScript's
syntax, but I did get this to work:

```typescript
let primes: number[] = [2, 3, 5, 7, 11, 13];
```

which transpiles into the following:

```c
int primes[] = {2, 3, 5, 7, 11, 13};
```

You can even use `sizeof` like so:

```typescript
import { printf } from "stdio.h";

export function main(): number {
  let primes: number[] = [2, 3, 5, 7, 11, 13];
  let primes_len: number = sizeof(primes) / sizeof(primes[0]);

  printf("primes_len = %d\n", primes_len);

  return 0;
}
```

In C, I'd usually opt in for dividing by `sizeof(int)` instead of
`sizeof(primes[0])`, but it doesn't really make a lot of sense here since we
don't really define the `int` symbol.

Nevertheless, it somehow works.

```typescript
sizeof(int); // => 4
```

Other than that, I've implemented the rest of the basic language features:
while loops, for loops (only the c-like ones though -- I couldn't figure out
how to do for..of and for..in)

```typescript
let i: number = 0;

while (i < 99) {
  printf("i = %d\n", i);
  i++;
}

for (let i: number = 0; i < 99; i++) {
  printf("i = %d\n", i);
}
```

is transpiled into:

```c
int i = 0;
while (i < 99) {
  printf("i = %d\n", i);
  i = i + 1;
}
for (int i = 0; i < 99; i = i + 1) {
  printf("i = %d\n", i);
}
```

I did have some trouble implementing the for loops, primarily because of the
semicolons. I'll elaborate on that.

Here is my for loop struct:

```rust
pub struct ForStatement {
    pub init: Box<Statement>,
    pub test: Expression,
    pub update: Box<Statement>,

    pub body: Box<Statement>,
}
```

You can see it primarily contains three fields (the body is not very relevant
to my issue.)

To make sure we're on the same page, this is what each of the fields mean.

- `init` is the first part of the for loop where you can initialize or declare
  a variable. It's a **statement**.

- `test` is the second part, after the first semicolon, which tests whether we
  should continue with the loop. It's an **expression**.

- `update` is the last part after the second semicolon which updates the
  counter, usually the same variable declared by `init`. It's a **statement**.

In the following case:

```c
for(int i = 0; i < 5; i++) {
    ...
}
```

- `int i = 0` is `init`
- `i < 5` is `test`
- `i++` is `update`

In my transpiler, I'd _always_ write a semicolon after statements, since before
I implemented for loops, they only appeared in places where you'd need a
semicolon (in their own lines).
When implementing for loops I realised that statements don't only appear in
their own lines.

I think it would be perfectly logical to terminate **all** statements with a
semicolon. This looks normal to me:

```c
for(int i = 0; i < 99; i++;) {
    ...
}
```

Yet C doesn't allow it.

Since I believe this is an inconsistency in C's design, I opted in for an
inconsistency on my transpiler:

```rs
statement.update.trim_end_matches(";");
```

Before I dive into the implementation details, here's bubble sort:

```typescript
export function bubbleSort(arr: number[], n: number): void {
  let i: number;
  let j: number;
  let temp: number;

  for (i = 0; i < n - 1; i++) {
    for (j = 0; j < n - i - 1; j++) {
      if (arr[j] > arr[j + 1]) {
        temp = arr[j];
        arr[j] = arr[j + 1];
        arr[j + 1] = temp;
      }
    }
  }
}
```

This transpiles into the following:

```c
void bubbleSort(int arr[], int n) {
  int i;
  int j;
  int temp;
  for (i = 0; i < n - 1; i = i + 1) {
    for (j = 0; j < n - i - 1; j = j + 1) {
      if (arr[j] > arr[j + 1]) {
        temp = arr[j];
        arr[j] = arr[j + 1];
        arr[j + 1] = temp;
      }
    }
  }
}
```

## Implementation

My first implementation was in TypeScript itself, since I thought It would have
better support for the language. I used [swc](https://swc.rs/)'s parser's
bindings for TypeScript. I quickly realized that I was not enjoying the library
or the workflow and so I opted in for Rust, which `swc` is written in.

I decided to create my own
[IR](https://en.wikipedia.org/wiki/Intermediate_representation), which is
basically a dumbed down AST which is derived from SWC's AST.

This is what my IR's root looks like:

```rs
pub struct Program {
    pub imports: Vec<Import>,
    pub methods: Vec<Method>,
}
```

And this is what the `Method` struct looks like:

```rs
pub struct Method {
    pub name: String,
    pub return_type: Type,
    pub parameters: Vec<MethodParameter>,
    pub body: Vec<Statement>,
}
```

And my `Statement` struct.

```rs
pub enum Statement {
    VariableDeclaration(VariableDeclaration),
    If(IfStatement),
    While(WhileStatement),
    For(ForStatement),
    Return(ReturnStatement),
    Expression(ExpressionStatement),
    Block(BlockStatement),
}
```

I used [SWC's Visit API](https://rustdoc.swc.rs/swc_visit/index.html). I
initially didn't fully understand how the library works or the Visitor Pattern
worked, but I eventually figured it out.

I implemented a `Visitor` struct implementing its `Visit` trait. The struct
contains some state:

```rs
pub struct Visitor {
    pub program: Program,

    pub current_function_name: Option<String>,
    pub current_function_params: Option<Vec<MethodParameter>>,
    pub current_function_return_type: Option<Type>,
    pub current_function_body: Option<Vec<Statement>>,
}
```

It implements these functions:

```rs
fn visit_import_decl(&mut self, node: &swc_ecma_ast::ImportDecl) { ... }

fn visit_fn_decl(&mut self, node: &swc_ecma_ast::FnDecl) { ... }

fn visit_function(&mut self, node: &swc_ecma_ast::Function) { ... }

fn visit_param(&mut self, node: &swc_ecma_ast::Param) { ... }

fn visit_stmt(&mut self, node: &swc_ecma_ast::Stmt) { ... }
```

I won't go into detail as to what they do specifically, but basically, they
recursively visit the AST nodes and convert them into my IR.

I call this step "parsing". I know it's not the right word, but I didn't know
what else to call it.

I came up with a trait called `ToIR`

```rs
pub trait ToIR<T> {
    fn to_ir(&self) -> Result<T>;
}
```

Obviously I could've just used `From` but I think this organizes the code
better. I might eventually refactor the codebase to use `From`.

My code structure went through quite a few different phases, but It ultimately
ended up looking like this.

```
├── expr
│   ├── array.rs
│   ├── call.rs
│   ├── mod.rs
│   └── ...
├── statement
│   ├── return_s.rs
│   ├── while_s.rs
│   ├── mod.rs
│   └── ...
├── types
│   ├── array.rs
│   ├── mod.rs
│   ├── primitive.rs
│   └── ...
└── ...
```

A "parser" (an implementation of `ToIR`) looks like this:

```rs
def_parser!(CallExpr, Expression, |expr| {
    let callee = *expr.callee.as_expr().unwrap().clone();

    let name = match callee {
        Expr::Ident(ident) => ident.sym.to_string(),

        other => bail!("non-supported callee kind: {:?}", other),
    };

    let arguments: Vec<Expression> = expr
        .args
        .iter()
        .map(|expr| expr.expr.to_ir())
        .map(Result::unwrap)
        .collect();

    Ok(Expression::MethodCall(MethodCall {
        name, arguments
    }))
});
```

Yes, I know, the error handling is _nasty_. I am not proud of the code quality.
I will slowly start to refactor it now that the project is for the most part
functional.

The important part is that I implemented a macro for implementing parsers, and
it greatly helped remove boilerplate.

I did the same for code generation. I have almost the same structure for code
generation: a `ToC` struct and a `def_codegen!` macro.

```rs
def_codegen!(Import, |import| {
    let mut buffer = CodeBuffer::default();

    buffer.write("#include <");
    buffer.write(import.module.as_str());
    buffer.write(">");

    Ok(buffer)
});
```

You will notice the `CodeBuffer` struct. This is my poor attempt at making some
sort of
[StringBuilder](https://docs.oracle.com/javase/8/docs/api/java/lang/StringBuilder.html)
equivalent for Rust. It's not fully needed but I think it's a pretty clean way
to write code generation code. This is roughly what it looks like:

```rs
pub struct CodeBuffer {
    lines: Vec<String>,
}

impl CodeBuffer {
    pub fn write<S: Into<String>>(&mut self, content: S) {
        let content = content.into();

        if let Some(last) = self.lines.last_mut() {
            last.push_str(&content);
        } else {
            self.write_line(content);
        }
    }

    pub fn write_line<S: Into<String>>(&mut self, content: S) {
        let content = content.into();

        self.lines.push(content);
    }

    pub fn concat(&mut self, other: &CodeBuffer) {
        self.lines.extend(other.lines.clone());
    }
}
```

I found the `concat` method useful for combining `CodeBuffer`s. I look at them
as some sort of combinators, because I implement `ToC` for tiny units of code,
and then concatenate them like this:

```rs
def_codegen!(Expression, |expr| {
    let mut buffer = CodeBuffer::default();

    match &expr {
        ...
        Self::MemberAccess(access) => {
            buffer.write(access.object.to_c()?);
            buffer.write("[");
            buffer.write(access.index.to_c()?);
            buffer.write("]");
        }
        ...
    }

    Ok(buffer);
});
```

### Recap

To recap, the code goes through this process:

- parsed by SWC, converting it to an AST
- AST is walked, creating IR AST
- IR AST is walked, converting it into C

PS: The smallest part of the codebase is the codegen, so It'd be super easy to
change the language it's transpiled to.

## Benchmarks

I really didn't focus on performance while making this, but here's the
benchmarks of me running it on the following program:

```ts
import { printf } from "stdio.h";

export function bubbleSort(arr: number[], n: number): void {
  let i: number;
  let j: number;
  let temp: number;

  for (i = 0; i < n - 1; i++) {
    for (j = 0; j < n - i - 1; j++) {
      if (arr[j] > arr[j + 1]) {
        temp = arr[j];
        arr[j] = arr[j + 1];
        arr[j + 1] = temp;
      }
    }
  }
}

export function printArray(arr: number[], n: number): void {
  let i: number;
  for (i = 0; i < n; i++) {
    printf("%d ", arr[i]);
  }
  printf("\n");
}

export function main(): number {
  const arr: number[] = [64, 34, 25, 12, 22, 11, 90];
  const n: number = 7;

  printf("Original array: ");
  printArray(arr, n);

  bubbleSort(arr, n);

  printf("Sorted array: ");
  printArray(arr, n);

  return 0;
}
```

(release build, running on an M1 Mac)

```
> hyperfine -N 'target/release/type-c-rs examples/bubble_sort.ts' --warmup 1000
Benchmark 1: target/release/type-c-rs examples/bubble_sort.ts
  Time (mean ± σ):       1.3 ms ±   0.1 ms    [User: 0.5 ms, System: 0.4 ms]
  Range (min … max):     1.2 ms …   2.1 ms    2258 runs
```
