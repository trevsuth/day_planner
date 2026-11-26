# Calculator

Open **Calculator** from the suite navigation or go to `/?view=calculator`.
Calculations run in your browser. Each tool keeps its draft while you switch
between Calculator tabs.

## Number Bases

Enter an integer and select binary, octal, decimal, or hexadecimal. The
result is shown in all four bases. Matching prefixes such as `0xFF` and a
leading sign are accepted. Calculations use exact integers, including values
larger than JavaScript's ordinary number precision.

Choose an operation to work with a second integer. The two inputs can use
different bases. Integer division truncates toward zero. Bitwise operations
use signed integers with unbounded two's-complement semantics.

## Base64

Choose **Encode** or **Decode**. Use **UTF-8 text** for Unicode strings and
**Hex bytes** for arbitrary bytes such as `FF 00`. Enable **URL-safe Base64**
when you need the `-` and `_` alphabet. URL-safe encoding omits padding.
If decoded bytes cannot be represented as UTF-8, switch to **Hex bytes**.

## IP Subnet

Enter an IPv4 or IPv6 address with a CIDR suffix, such as
`192.168.1.35/24` or `2001:db8::1/64`. The result includes the network,
first and last addresses, and total count. IPv4 additionally shows the
netmask, wildcard mask, and usable host range. The IPv4 `/31` case treats
both addresses as point-to-point endpoints, and `/32` is one address.

Enter a second IP address to check whether it falls within the subnet.

Under **Split a subnet**, enter a parent CIDR and a longer child prefix.
For example, splitting `192.168.1.0/24` into `/26` networks produces four
subnets starting at `192.168.1.0`, `192.168.1.64`, `192.168.1.128`, and
`192.168.1.192`, each with 64 addresses. IPv6 uses the same controls.
Results show up to 128 child networks per page. Enter a page number and
select **Split subnet** to jump to that page. Copy CIDRs from the result box.
