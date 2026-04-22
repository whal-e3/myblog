---
title: "Easy Unpack"
description: "Wargame writeup of \"Easy Unpack\" from reversing.kr."
date: 2026-02-20
draft: false
tags:
  - reversing
  - windows
  - x32dbg
  - packing
comments: true
---

```
ReversingKr UnpackMe
Find the OEP.
ex) 00401000
```

## Study

- OEP: Original Entry Point
  - first instruction of the program's real code.

### Packing && Unpacking

- Packing: Like zip-ing an executable.

> Finding the entry point (*OEP*) is essential to the Unpacking! It's how you find the actual binary.

- **Structure of packed program**
  - New packer's Header
  - Compressed binary
  - Stub (Decompressor)

- **Process of Unpacking**
  1. Header : Jmp to Stub code.
  2. Stub : Decompresses the compressed binary.
  3. Decompressed binary : Jmp to the binary.

#### How Packed binary looks like — x32dbg

> [tmxklab 윈도우 실행파일 구조(PE파일) 블로그 참고](https://rninche01.tistory.com/entry/%EC%9C%88%EB%8F%84%EC%9A%B0-%EC%8B%A4%ED%96%89%ED%8C%8C%EC%9D%BC-%EA%B5%AC%EC%A1%B0PE%ED%8C%8C%EC%9D%BC)

- AddresssOfEntryPoint : Where the code starts. (after mapping to the memory)

![AddressOfEntryPoint](/assets/content/writeup/reversing_kr/easy_unpack/2026-02-12-203017.png)

- bp-list (Possible points where Unpacking might happen.)

```
- VirtualProtect
- NtProtectVirtualMemory
- VirtualAlloc
- NtAllocateVirtualMemory
- NtWriteVirtualMemory
```

Continue the process... (f9)

![VirtualProtect hit](/assets/content/writeup/reversing_kr/easy_unpack/2026-02-12-204723.png)

```cpp
BOOL VirtualProtect(
  [in]  LPVOID lpAddress,
  [in]  SIZE_T dwSize,
  [in]  DWORD  flNewProtect,
  [out] PDWORD lpflOldProtect
);
```

![VirtualProtect args](/assets/content/writeup/reversing_kr/easy_unpack/2026-02-12-204726.png)

-> Allow read/write for 00405000 ~ 00406000. (Maybe the unpack overwrite the sections??)

- After the final `VirtualProtect()` call, the process jmp to `00401150`.

![Jump to 00401150](/assets/content/writeup/reversing_kr/easy_unpack/2026-02-12-212129.png)

- `GetVersion()`, `GetCommandLineA()`, `GetStartupInfoA()`...
  - These functions runs on a program start-up!

- The process reaches `00401219` and JMP to `00401000`.

![Jump to 00401000](/assets/content/writeup/reversing_kr/easy_unpack/2026-02-12-213821.png)

- `CreateWindowExA`, `GetMessageA` ...
  - ...

- a blank window pops up!

![Blank window](/assets/content/writeup/reversing_kr/easy_unpack/2026-02-12-212258.png)

#### How to Unpack using IDA

1. Select IDA windows debugger from the "Debugger options" menu

![IDA debugger](/assets/content/writeup/reversing_kr/easy_unpack/2026-02-12-140747.png)

2. Start Process
3. Run the binary
4. Find "....Easy_UnpackMe.exe" in the "Modules" tab. Get the address.
5. File -> Script Command ("Cut out ")

```python
import ida_bytes

output_file = "dumped_code.bin"

# Define the range
start_ea = 0x400000
end_ea = 0x40A680
size = end_ea - start_ea

data = ida_bytes.get_bytes(start_ea, size)

if data:
    with open(output_file, "wb") as f:
        f.write(data)
    print(f"Successfully dumped {len(data)} bytes to {output_file}")
else:
    print("Failed to read memory. Check if the addresses are valid.")
```

![IDA dump](/assets/content/writeup/reversing_kr/easy_unpack/2026-02-11-174513.png)

### Side-hustle

> How `.exe` looks is made? The structure?

#### hello.exe

- Install MSYS2 for cpp compile.

![MSYS2](/assets/content/writeup/reversing_kr/easy_unpack/2026-02-11-171556.png)

## Solution

```bash
Easy_UnpackMe.exe: PE32 executable (GUI) Intel 80386, for MS Windows, 5 sections
```

1. Find functions like below which are indicator of where the unpacked be placed.

```
- VirtualProtect
- NtProtectVirtualMemory
- VirtualAlloc
- NtAllocateVirtualMemory
- NtWriteVirtualMemory
```

![VirtualProtect args](/assets/content/writeup/reversing_kr/easy_unpack/2026-02-12-204726.png)

- Can check that `VirtualProtect()` allows read/write for `00401000 ~ 00405000` && `00406000 ~ 00409000` which are original place of where `easy_unpackme.exe` is.

![Sections](/assets/content/writeup/reversing_kr/easy_unpack/2026-02-12-215553.png)

2. After final call of `VirtualProtect()`, the process JMP to `00401150`.

![Jump to 00401150](/assets/content/writeup/reversing_kr/easy_unpack/2026-02-12-212129.png)

- `GetVersion()`, `GetCommandLineA()`, `GetStartupInfoA()`...
  - These functions usually runs on a program start-up!

3. The process reaches `00401219` and JMP to `00401000`.

![Jump to 00401000](/assets/content/writeup/reversing_kr/easy_unpack/2026-02-12-213821.png)

- `CreateWindowExA`, `GetMessageA` ...
  - Which are for initializing Windows GUI

4. And after some `f8` blank window pops up.

![Blank window](/assets/content/writeup/reversing_kr/easy_unpack/2026-02-12-212258.png)

Hence I can conclude that `00401150`

### Btw...

The `.Gogi`, `.Gwan` sections are named after the creator of reversing.kr "고기완".

## Flag

`00401150`
