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

The code for this project is [available on GitHub][1].

Over the past few days, I've been working on a little program which transpiles
TypeScript to C. It's called `type-c`. This is an interesting task, because:
1) TypeScript and C are two **very** different languages,
2) Using TypeScript allows us to skip the analysis stage and work straight with
   the AST

`type-c` doesn't do much. It doesn't inject polyfills into your code, so your
TypeScript program must adapt to C's conventions and paradigm. That goes
without saying that it doesn't have support for JS/TS's standard library, like
`console`, `Array`, or any FP-related functions like `forEach` or `map`.

This design choice made the project's goal clearer: to be able to write C with
the syntax of TypeScript. Obviously, there's no particular reason that anyone
would want to do this, but it's still a fun experiment.

## What it looks like
I mentioned the fact that `type-c` doesn't expose a `console` object, so how
does one log something? the answer is `printf`.

```ts
printf("Hello, C!\n");
```

But that's not a correct `type-c` program. You need to export a `main`
function, just like C programs. Oh, and you need to import `printf`.

```ts
import { printf } from "stdio.h";

export function main(argc: number, argv: string[]): number {
  printf("Hello, C!\n");
  return 0;
}
```

This compiles to the following:

```c
#include <stdio.h>

int main(int argc, char** argv) {
  printf("Hello, C!\n");
  return 0;
}
```

### Imports
You likely noticed the import -- it imports `printf` from `stdio.h`. This is
the way to `#include` header files from within TypeScript in `type-c`. The item
that is being imported doesn't really matter, but it matters very much that
there is an import statement with the header file which needs to be included.

Of course, the same applies for booleans.
```ts
import { true, false } from "stdbool.h";
```

### Types
You may also notice that we only really have one number type: `number`, which
is just translated to `int` in C. That is because JS/TS uses a *single* type
for all kinds of numbers (backed by a `f64`). 

I decided to map `number` to an `int` rather than a `double`, because `int` is
more commonly used, particularly in critical parts such as the `main`
function's return type.

### Pointers
One thing that was fun to implement were pointers. TypeScript obviously won't
allow us to use `&` and `*` characters like we do in C, so I opted for a
solution that feels more native to TypeScript.

```ts
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
not implemented in TypeScript -- `type-c` syntactically replaces them to the
equivalent C syntax.

### Arrays
Since pointers work, I also implemented arrays, sort of. I couldn't implement
fixed-sized arrays because of TypeScript not allowing the syntax.

```ts
let primes: number[] = [2, 3, 5, 7, 11, 13];
```

transpiles into the following:

```c
int primes[] = {2, 3, 5, 7, 11, 13};
```

You can even use `sizeof` like so:

```ts
let primes: number[] = [2, 3, 5, 7, 11, 13];
let primes_len: number = sizeof(primes) / sizeof(primes[0]);
```

A more common practice in C when wanting to get the length of an array is to
divide by the size of the data type which the array holds, like `sizeof(int)`.

This is possible in `type-c`:

```ts
sizeof(int); // => 4
```

### Control Flow
`while` loops were trivial to implement -- the syntax is for the most part
identical between TypeScript and C:

```ts
let i: number = 0;

while (i < 99) {
  printf("i = %d\n", i);
  i++;
}
```

transpiles to:
```c
int i = 0;
while (i < 99) {
  printf("i = %d\n", i);
  i = i + 1;
}
```

I did have some trouble implementing `for` loops, primarily because of the
semicolons.

Here is my `for` loop struct:

```rust
pub struct ForStatement {
    pub init: Box<Statement>,
    pub test: Expression,
    pub update: Box<Statement>,

    pub body: Box<Statement>,
}
```

You can see that it primarily contains three fields (the body is not very
relevant to this issue.)

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

The problem is that my transpiler would *always* write a semicolon after
statements. If I was to revisit the project I would change that, but as of
writing, this is how it's currently done. The problem is that the `update`
statement would *also* have a semicolon, which is invalid syntax in C, at least
for `gcc`.

I wasn't sure of how to fix it so I just opted in for a hacky solution, which
I'm really not proud of:
```rs
statement.update.trim_end_matches(";");
```

Now, it works:
```ts
for (let j: number = 0; j < 99; j++) {
  printf("j = %d\n", j);
}
```

transpiles to
```c
for (int i = 0; i < 99; i = i + 1) {
  printf("i = %d\n", i);
}
```

### Bubble Sort
`type-c` can successfuly compile Bubble sort.

```ts
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
better support for the language. I used [swc][2]'s parser's bindings for
TypeScript. I quickly realized that I was not enjoying the library or the
workflow, so I opted in for Rust, which `swc` is written in.

I decided to create my own [IR][3], which is basically a dumbed down AST which
is derived from SWC's AST.

This is what my IR's root looks like:

```rs
pub struct Program {
    pub imports: Vec<Import>,
    pub methods: Vec<Method>,
}
```

This is what the `Method` struct looks like:

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

I used [SWC's Visit API][4]. I initially didn't fully understand how the
library or the Visitor Pattern worked, but I eventually figured it out.

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

I won't go into detail as to what they do specifically, [you can look into that
yourself][5] but short: they recursively visit the AST nodes and convert them
into my IR. In the codebase I call this step "parsing", even though it's not
really parsing, but it's close enough.

I came up with a trait called `ToIR`

```rs
pub trait ToIR<T> {
    fn to_ir(&self) -> Result<T>;
}
```

Obviously I could've just used `From` but I think this organizes the code
better. I might eventually refactor the codebase to use `From`.

My code structure went through quite a few different phases, but it ultimately
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

Right now, the error handling is _nasty_. I am not proud of the code quality. I
will slowly start to refactor it now that the project is for the most part
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
sort of [StringBuilder][6] equivalent for Rust. It's not fully needed but I
think it's a pretty clean way to write code generation code. This is roughly
what its API looks like.

```rs
pub struct CodeBuffer {
    lines: Vec<String>,
}

impl CodeBuffer {
    pub fn write<S: Into<String>>(&mut self, content: S) { ... }
    pub fn write_line<S: Into<String>>(&mut self, content: S) { ... }
    pub fn concat(&mut self, other: &CodeBuffer) { ... }
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

## Recap

To recap, the code goes through this process:

1. Parsed by SWC, converting it to an AST
2. AST is walked, converting it to the IR
3. IR is walked, converting it into C

PS: The smallest part of the codebase is the codegen, so It'd be super easy to
change the language it's transpiled to.

[1]: https://github.com/podikoglou/type-c
[2]: https://swc.rs/
[3]: https://en.wikipedia.org/wiki/Intermediate_representation
[4]: https://rustdoc.swc.rs/swc_visit/index.html
[5]: https://github.com/podikoglou/type-c/blob/main/src/parsing/swc/visitor.rs#L43
[6]: https://docs.oracle.com/javase/8/docs/api/java/lang/StringBuilder.html
